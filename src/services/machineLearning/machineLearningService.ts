import { File, getLocalFiles } from 'services/fileService';
import DownloadManager from 'services/downloadManager';

import * as tf from '@tensorflow/tfjs-core';
// import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';

// import TFJSFaceDetectionService from './tfjsFaceDetectionService';
// import TFJSFaceEmbeddingService from './tfjsFaceEmbeddingService';
import {
    FaceApiResult,
    FaceImage,
    FaceWithEmbedding,
    MLSyncResult,
} from 'utils/machineLearning/types';

import * as jpeg from 'jpeg-js';
import ClusteringService from './clusteringService';

import './faceEnvPatch';
import * as faceapi from 'face-api.js';
import { SsdMobilenetv1Options } from 'face-api.js';

class MachineLearningService {
    // private faceDetectionService: TFJSFaceDetectionService;
    // private faceEmbeddingService: TFJSFaceEmbeddingService;
    private clusteringService: ClusteringService;

    private clusterFaceDistance = 0.4;
    private minClusterSize = 4;
    private minFaceSize = 24;
    private batchSize = 50;

    public allFaces: FaceWithEmbedding[];
    private allFaceImages: FaceImage[];

    public constructor() {
        // this.faceDetectionService = new TFJSFaceDetectionService();
        // this.faceEmbeddingService = new TFJSFaceEmbeddingService();
        this.clusteringService = new ClusteringService();

        this.allFaces = [];
        this.allFaceImages = [];
    }

    public async init(
        clusterFaceDistance: number,
        minClusterSize: number,
        minFaceSize: number,
        batchSize: number
    ) {
        this.clusterFaceDistance = clusterFaceDistance;
        this.minClusterSize = minClusterSize;
        this.minFaceSize = minFaceSize;
        this.batchSize = batchSize;

        // setWasmPath('/js/tfjs/');
        await tf.ready();

        // await this.faceDetectionService.init();
        // await this.faceEmbeddingService.init();
        console.log('01 TF Memory stats: ', tf.memory());
        await faceapi.nets.ssdMobilenetv1.loadFromUri('/models/face-api/');
        // console.log('02 TF Memory stats: ', tf.memory());
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models/face-api/');
        // console.log('03 TF Memory stats: ', tf.memory());
        await faceapi.nets.faceRecognitionNet.loadFromUri('/models/face-api/');
        console.log('04 TF Memory stats: ', tf.memory());
    }

    private getUniqueFiles(files: File[], limit: number) {
        const uniqueFiles: Map<number, File> = new Map<number, File>();
        for (let i = 0; uniqueFiles.size < limit && i < files.length; i++) {
            if (!uniqueFiles.has(files[i].id)) {
                uniqueFiles.set(files[i].id, files[i]);
            }
        }

        return uniqueFiles;
    }

    public async sync(token: string): Promise<MLSyncResult> {
        if (!token) {
            throw Error('Token needed by ml service to sync file');
        }

        const existingFiles = await getLocalFiles();
        existingFiles.sort(
            (a, b) => b.metadata.creationTime - a.metadata.creationTime
        );
        const files = this.getUniqueFiles(existingFiles, this.batchSize);
        console.log(
            'Got unique files: ',
            files.size,
            'for batchSize: ',
            this.batchSize
        );

        this.allFaces = [];
        for (const file of files.values()) {
            try {
                const result = await this.syncFile(file, token);
                this.allFaces = this.allFaces.concat(result);
                // this.allFaceImages = this.allFaceImages.concat(
                //     result.faceImages
                // );
                console.log('TF Memory stats: ', tf.memory());
            } catch (e) {
                console.error(
                    'Error while syncing file: ',
                    file.id.toString(),
                    e
                );
            }
        }
        console.log('allFaces: ', this.allFaces);

        faceapi.nets.ssdMobilenetv1.dispose();
        // console.log('11 TF Memory stats: ', tf.memory());
        await faceapi.nets.faceLandmark68Net.dispose();
        // console.log('12 TF Memory stats: ', tf.memory());
        await faceapi.nets.faceRecognitionNet.dispose();
        console.log('13 TF Memory stats: ', tf.memory());

        // [0].alignedRect,
        // this.allFaces[0].alignedRect.box,
        // this.allFaces[0].alignedRect.imageDims

        const clusterResults = this.clusteringService.clusterUsingDBSCAN(
            this.allFaces.map((f) => Array.from(f.face.descriptor)),
            this.clusterFaceDistance,
            this.minClusterSize
        );

        // const clusterResults = this.clusteringService.clusterUsingKMEANS(
        //     this.allFaces.map((f) => f.embedding),
        //     10);

        console.log('[MLService] Got cluster results: ', clusterResults);

        return {
            allFaces: this.allFaces,
            clusterResults,
        };
    }

    private async syncFile(file: File, token: string) {
        if (!token) {
            throw Error('Token needed by ml service to sync file');
        }

        const fileUrl = await DownloadManager.getPreview(file, token);
        console.log('[MLService] Got thumbnail: ', file.id.toString(), fileUrl);

        const thumbFile = await fetch(fileUrl);
        const arrayBuffer = await thumbFile.arrayBuffer();
        const decodedImg = await jpeg.decode(arrayBuffer);
        console.log('[MLService] decodedImg: ', decodedImg);

        // console.log('1 TF Memory stats: ', tf.memory());
        const tfImage = tf.browser.fromPixels(decodedImg);
        // console.log('2 TF Memory stats: ', tf.memory());
        // const faces = await this.faceDetectionService.estimateFaces(tfImage);

        // const embeddingResults = await this.faceEmbeddingService.getEmbeddings(
        //     tfImage,
        //     filtertedFaces
        // );

        // console.log('3 TF Memory stats: ', tf.memory());
        // const faceApiInput = tfImage.expandDims(0) as tf.Tensor4D;
        // tf.dispose(tfImage);
        // console.log('4 TF Memory stats: ', tf.memory());
        const faces = (await faceapi
            .detectAllFaces(
                tfImage as any,
                new SsdMobilenetv1Options({
                    // minConfidence: 0.6
                    // maxResults: 10
                })
            )
            .withFaceLandmarks()
            .withFaceDescriptors()) as FaceApiResult[];

        // console.log('5 TF Memory stats: ', tf.memory());

        const filtertedFaces = faces.filter((face) => {
            return (
                face.alignedRect.box.width > this.minFaceSize // &&
                // face.alignedBox[3] - face.alignedBox[1] > this.minFacePixels
            );
        });
        console.log('filtertedFaces: ', filtertedFaces);

        // const embeddings = results.map(f=>f.descriptor);
        // console.log('embeddings', embeddings);
        let faceImages = [];
        if (filtertedFaces && filtertedFaces.length > 0) {
            const faceBoxes = filtertedFaces
                .map((f) => f.alignedRect.relativeBox)
                .map((b) => [b.top, b.left, b.bottom, b.right]);
            const faceImagesTensor = tf.tidy(() => {
                // const tfImage = tf.browser.fromPixels(decodedImg);
                const faceApiInput = tfImage.expandDims(0) as tf.Tensor4D;
                const normalizedImage = tf.sub(
                    tf.div(faceApiInput, 127.5),
                    1.0
                ) as tf.Tensor4D;
                // console.log('6 TF Memory stats: ', tf.memory());
                return tf.image.cropAndResize(
                    normalizedImage,
                    faceBoxes,
                    tf.fill([faceBoxes.length], 0, 'int32'),
                    [112, 112]
                );
            });
            // console.log('7 TF Memory stats: ', tf.memory());
            faceImages = await faceImagesTensor.array();
            // console.log(JSON.stringify(results));
            // tf.dispose(normalizedImage);
            tf.dispose(faceImagesTensor);
            // tf.dispose(faceApiInput);
        }

        tf.dispose(tfImage);
        // console.log('8 TF Memory stats: ', tf.memory());

        return filtertedFaces.map((ff, index) => {
            return {
                fileId: file.id.toString(),
                face: ff,
                faceImage: faceImages[index],
            } as FaceWithEmbedding;
        });

        // console.log('[MLService] Got faces: ', filtertedFaces, embeddingResults);

        // return filtertedFaces.map((face, index) => {
        //     return {
        //         fileId: file.id.toString(),
        //         face: face,
        //         embedding: embeddingResults.embeddings[index],
        //         faceImage: embeddingResults.faceImages[index],
        //     } as FaceWithEmbedding;
        // });
    }
}

export default MachineLearningService;
