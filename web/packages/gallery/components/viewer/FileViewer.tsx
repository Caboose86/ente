/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

// TODO(PS): WIP gallery using upstream photoswipe
//
// Needs (not committed yet):
// yarn workspace gallery add photoswipe@^5.4.4
// mv node_modules/photoswipe packages/new/photos/components/ps5

if (process.env.NEXT_PUBLIC_ENTE_WIP_PS5) {
    console.warn("Using WIP upstream photoswipe");
} else {
    throw new Error("Whoa");
}

import { isDesktop } from "@/base/app";
import { type ModalVisibilityProps } from "@/base/components/utils/modal";
import { lowercaseExtension } from "@/base/file-name";
import type { LocalUser } from "@/base/local-user";
import log from "@/base/log";
import {
    FileInfo,
    type FileInfoExif,
    type FileInfoProps,
} from "@/gallery/components/FileInfo";
import type { Collection } from "@/media/collection";
import { FileType } from "@/media/file-type";
import type { EnteFile } from "@/media/file.js";
import { isHEICExtension, needsJPEGConversion } from "@/media/formats";
import {
    ImageEditorOverlay,
    type ImageEditorOverlayProps,
} from "@/new/photos/components/ImageEditorOverlay";
import { Button, styled } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fileInfoExifForFile } from "./data-source";
import {
    FileViewerPhotoSwipe,
    type FileViewerAnnotatedFile,
} from "./photoswipe";

export type FileViewerProps = ModalVisibilityProps & {
    /**
     * The currently logged in user, if any.
     *
     * - If we're running in the context of the photos app, then this should be
     *   set to the currently logged in user.
     *
     * - If we're running in the context of the public albums app, then this
     *   should not be set.
     *
     * See: [Note: Gallery children can assume user]
     */
    user?: LocalUser;
    /**
     * The list of files that are currently being displayed in the context in
     * which the file viewer was invoked.
     *
     * Although the file viewer is called on to display a particular file
     * (specified by the {@link initialIndex} prop), the viewer is always used
     * in the context of a an album, or search results, or some other arbitrary
     * list of files. The {@link files} prop sets this underlying list of files.
     *
     * After the initial file has been shown, the user can navigate through the
     * other files from within the viewer by using the arrow buttons.
     */
    files: EnteFile[];
    /**
     * The index of the file that should be initially shown.
     *
     * Subsequently the user may navigate between files by using the controls
     * provided within the file viewer itself.
     */
    initialIndex: number;
    /**
     * `true` when we are viewing files in the Trash.
     */
    isInTrashSection?: boolean;
    /**
     * `true` when we are viewing files in the hidden section.
     */
    isInHiddenSection?: boolean;
    /**
     * If true then the viewer does not show controls for downloading the file.
     */
    disableDownload?: boolean;
    /**
     * File IDs of all the files that the user has marked as a favorite.
     *
     * If this is not provided then the favorite toggle button will not be shown
     * in the file actions.
     */
    favoriteFileIDs?: Set<number>;
    /**
     * Called when there was some update performed within the file viewer that
     * necessitates us to sync with remote again to fetch the latest updates.
     *
     * This is called lazily, and at most once, when the file viewer is closing
     * if any changes were made in the file info panel of the file viewer for
     * any of the files that the user was viewing (e.g. if they changed the
     * caption). Those changes have already been applied to both remote and to
     * the in-memory file object used by the file viewer; this callback is to
     * trigger a sync so that our local database also gets up to speed.
     *
     * If we're in a context where edits are not possible, e.g. {@link user} is
     * not defined, then this prop is not used.
     */
    onTriggerSyncWithRemote?: () => void;
    /**
     * Called when the user edits an image in the image editor and asks us to
     * save their edits as a copy.
     *
     * Editing is disabled if this is not provided.
     *
     * See {@link onSaveEditedCopy} in the {@link ImageEditorOverlay} props for
     * documentation about the parameters.
     */
    onSaveEditedImageCopy?: ImageEditorOverlayProps["onSaveEditedCopy"];
} & Pick<
        FileInfoProps,
        | "fileCollectionIDs"
        | "allCollectionsNameByID"
        | "onSelectCollection"
        | "onSelectPerson"
    >;

/**
 * A PhotoSwipe based image and video viewer.
 */
const FileViewer: React.FC<FileViewerProps> = ({
    open,
    onClose,
    user,
    files,
    initialIndex,
    isInTrashSection,
    isInHiddenSection,
    disableDownload,
    favoriteFileIDs,
    fileCollectionIDs,
    allCollectionsNameByID,
    onSelectCollection,
    onSelectPerson,
    onTriggerSyncWithRemote,
    onSaveEditedImageCopy,
}) => {
    const pswpRef = useRef<FileViewerPhotoSwipe | undefined>();

    // Whenever we get a callback from our custom PhotoSwipe instance, we also
    // get the active file on which that action was performed as an argument.
    // Save it as a prop so that the rest of our React tree can use it.
    //
    // This is not guaranteed, or even intended, to be in sync with the active
    // file shown within the file viewer. All that this guarantees is this will
    // refer to the file on which the last user initiated action was performed.
    const [activeAnnotatedFile, setActiveAnnotatedFile] = useState<
        FileViewerAnnotatedFile | undefined
    >(undefined);
    // With semantics similar to activeFile, this is the exif data associated
    // with the activeAnnotatedFile, if any.
    const [activeFileExif, setActiveFileExif] = useState<
        FileInfoExif | undefined
    >(undefined);

    const [openFileInfo, setOpenFileInfo] = useState(false);
    const [openImageEditor, setOpenImageEditor] = useState(false);

    // If `true`, then we need to trigger a sync with remote when we close.
    const [, setNeedsSync] = useState(false);

    const handleClose = useCallback(() => {
        setNeedsSync((needSync) => {
            if (needSync) onTriggerSyncWithRemote?.();
            return false;
        });
        setOpenFileInfo(false);
        setOpenImageEditor(false);
        onClose();
    }, [onTriggerSyncWithRemote, onClose]);

    const handleAnnotate = useCallback(
        (file: EnteFile) => {
            log.debug(() => ["viewer", { action: "annotate", file }]);
            const fileID = file.id;
            const isOwnFile = file.ownerID == user?.id;
            const canFavoriteOrEdit =
                isOwnFile && !isInTrashSection && !isInHiddenSection;
            const isFavorite = canFavoriteOrEdit
                ? favoriteFileIDs?.has(file.id)
                : undefined;
            const isEditableImage =
                onSaveEditedImageCopy && canFavoriteOrEdit
                    ? fileIsEditableImage(file)
                    : undefined;
            return { fileID, isOwnFile, isFavorite, isEditableImage };
        },
        [
            user,
            isInTrashSection,
            isInHiddenSection,
            favoriteFileIDs,
            onSaveEditedImageCopy,
        ],
    );

    const handleToggleFavorite = useMemo(() => {
        return favoriteFileIDs
            ? (annotatedFile: FileViewerAnnotatedFile) => {
                  setActiveAnnotatedFile(annotatedFile);
                  console.log("handleToggleFavorite", annotatedFile);
              }
            : undefined;
    }, [favoriteFileIDs]);

    const handleViewInfo = useCallback(
        (annotatedFile: FileViewerAnnotatedFile) => {
            setActiveAnnotatedFile(annotatedFile);
            setActiveFileExif(
                fileInfoExifForFile(annotatedFile.file, (exif) =>
                    setActiveFileExif(exif),
                ),
            );
            setOpenFileInfo(true);
        },
        [],
    );

    const handleInfoClose = useCallback(() => setOpenFileInfo(false), []);

    const handleScheduleUpdate = useCallback(() => setNeedsSync(true), []);

    const handleSelectCollection = useCallback(
        (collectionID: number) => {
            onSelectCollection(collectionID);
            handleClose();
        },
        [onSelectCollection, handleClose],
    );

    const handleSelectPerson = useMemo(() => {
        return onSelectPerson
            ? (personID: string) => {
                  onSelectPerson(personID);
                  handleClose();
              }
            : undefined;
    }, [onSelectPerson, handleClose]);

    const handleEditImage = useMemo(() => {
        return onSaveEditedImageCopy
            ? (annotatedFile: FileViewerAnnotatedFile) => {
                  setActiveAnnotatedFile(annotatedFile);
                  setOpenImageEditor(true);
              }
            : undefined;
    }, [onSaveEditedImageCopy]);

    const handleImageEditorClose = useCallback(
        () => setOpenImageEditor(false),
        [],
    );

    const handleSaveEditedCopy = useCallback(
        (editedFile: File, collection: Collection, enteFile: EnteFile) => {
            onSaveEditedImageCopy(editedFile, collection, enteFile);
            handleImageEditorClose();
            handleClose();
        },
        [onSaveEditedImageCopy, handleImageEditorClose, handleClose],
    );

    useEffect(() => {
        log.debug(() => ["viewer", { action: "useEffect", open }]);

        if (!open) {
            // The close state will be handled by the cleanup function.
            return;
        }

        const pswp = new FileViewerPhotoSwipe({
            files,
            initialIndex,
            disableDownload,
            onClose: handleClose,
            onAnnotate: handleAnnotate,
            onToggleFavorite: handleToggleFavorite,
            onViewInfo: handleViewInfo,
            onEditImage: handleEditImage,
        });
        pswpRef.current = pswp;

        return () => {
            log.debug(() => [
                "viewer",
                { action: "useEffect/cleanup", pswpRef: pswpRef.current },
            ]);
            pswpRef.current?.closeIfNeeded();
            pswpRef.current = undefined;
        };
        // The hook is missing dependencies; this is intentional - we don't want
        // to recreate the PhotoSwipe dialog when these dependencies change.
        //
        // - Updates to initialIndex can be safely ignored: they don't matter,
        //   only their initial value at the time of open mattered.
        //
        // - Updates to other properties are not expected after open. We could've
        //   also added it to the dependencies array, not adding it was a more
        //   conservative choice to be on the safer side and trigger too few
        //   instead of too many updates.
        //
        // - Updates to files matter, but these are conveyed separately.
        //   TODO(PS):
        //
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, onClose, handleViewInfo]);

    const handleRefreshPhotoswipe = useCallback(() => {
        pswpRef.current.refreshCurrentSlideContent();
    }, []);

    log.debug(() => ["viewer", { action: "render", pswpRef: pswpRef.current }]);

    return (
        <Container>
            <Button>Test</Button>
            <FileInfo
                open={openFileInfo}
                onClose={handleInfoClose}
                file={activeAnnotatedFile?.file}
                exif={activeFileExif}
                allowEdits={!!activeAnnotatedFile?.annotation.isOwnFile}
                allowMap={!!user}
                showCollections={!!user}
                scheduleUpdate={handleScheduleUpdate}
                refreshPhotoswipe={handleRefreshPhotoswipe}
                onSelectCollection={handleSelectCollection}
                onSelectPerson={handleSelectPerson}
                {...{ fileCollectionIDs, allCollectionsNameByID }}
            />
            <ImageEditorOverlay
                open={openImageEditor}
                onClose={handleImageEditorClose}
                file={activeAnnotatedFile?.file}
                onSaveEditedCopy={handleSaveEditedCopy}
            />
        </Container>
    );
};

export default FileViewer;

const Container = styled("div")`
    border: 1px solid red;

    #test-gallery {
        border: 1px solid red;
        min-height: 10px;
    }
`;

const fileIsEditableImage = (file: EnteFile) => {
    // Only images are editable.
    if (file.metadata.fileType !== FileType.image) return false;

    const extension = lowercaseExtension(file.metadata.title);
    // Assume it is editable;
    let isRenderable = true;
    if (extension && needsJPEGConversion(extension)) {
        // See if the file is on the whitelist of extensions that we know
        // will not be directly renderable.
        if (!isDesktop) {
            // On the web, we only support HEIC conversion.
            isRenderable = isHEICExtension(extension);
        }
    }
    return isRenderable;
};
