/* eslint-disable */
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

import { useModalVisibility } from "@/base/components/utils/modal";
import { FileInfo } from "@/gallery/components/FileInfo";
import type { EnteFile } from "@/media/file.js";
import { Button, styled } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileViewerPhotoSwipe } from "./photoswipe";

export interface FileViewerProps {
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
     * If true then the viewer does not show controls for downloading the file.
     */
    disableDownload?: boolean;
}

/**
 * A PhotoSwipe based image and video viewer.
 */
const FileViewer: React.FC<FileViewerProps> = ({
    open,
    onClose,
    files,
    initialIndex,
    disableDownload,
}) => {
    const pswpRef = useRef<FileViewerPhotoSwipe | undefined>();

    // Whenever we get a callback from our custom PhotoSwipe instance, we also
    // get the active file on which that action was performed as an argument.
    // Save it as a prop so that the rest of our React tree can use it.
    //
    // This is not guaranteed, or even intended, to be in sync with the active
    // file shown within the file viewer. All that this guarantees is this will
    // refer to the file on which the last user initiated action was performed.
    const [activeFile, setActiveFile] = useState<EnteFile | undefined>(
        undefined,
    );

    const { show: showFileInfo, props: fileInfoVisibilityProps } =
        useModalVisibility();

    const handleViewInfo = useCallback((file: EnteFile) => {
        setActiveFile(file);
        showFileInfo();
    }, []);

    useEffect(() => {
        if (!open) {
            // The close state will be handled by the cleanup function.
            return;
        }

        const pswp = new FileViewerPhotoSwipe({
            files,
            initialIndex,
            disableDownload,
            onClose,
            onViewInfo: handleViewInfo,
        });
        pswpRef.current = pswp;

        return () => {
            pswpRef.current?.closeIfNeeded();
            pswpRef.current = undefined;
        };
    }, [open]);

    return (
        <Container>
            <Button>Test</Button>
            <FileInfo {...fileInfoVisibilityProps} file={activeFile} />
        </Container>
    );
};

const Container = styled("div")`
    border: 1px solid red;

    #test-gallery {
        border: 1px solid red;
        min-height: 10px;
    }
`;

export default FileViewer;
