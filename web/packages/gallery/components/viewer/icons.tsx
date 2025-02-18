/**
 * @file [Note: SVG paths of MUI icons]
 *
 * When creating buttons for use with PhotoSwipe, we need to provide just the
 * contents of the SVG element (e.g. paths) as an HTML string.
 *
 * Since we only need a handful, these strings were created by temporarily
 * adding the following code in some existing React component to render the
 * corresponding MUI icon React component to a string, and retain the path.
 *
 *
 *     import { renderToString } from "react-dom/server";
 *     import InfoOutlinedIcon from ;
 *
 *     console.log(renderToString(<InfoOutlinedIcon />));
 */

const paths = {
    // "@mui/icons-material/InfoOutlined"
    info: '<path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8"',
};

/**
 * Return an object that can be passed verbatim to the "html" option expected by
 * PhotoSwipe's registerElement function.
 *
 * API docs for registerElement:
 * https://photoswipe.com/adding-ui-elements/#uiregisterelement-api
 *
 * Example:
 *
 *     html: {
 *         isCustomSVG: true,
 *         inner: '<path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8" transform="translate(3.5, 3.5)" id="pswp__icn-info" />',
 *         outlineID: "pswp__icn-info",
 *     }
 *
 */
export const createPSRegisterElementIconHTML = (name: "info") => ({
    isCustomSVG: true,
    // TODO(PS): This transform is temporary, audit later.
    inner: `${paths[name]} transform="translate(3.5, 3.5)" id="pswp__icn-${name}"`,
    outlineID: `pswp__icn-${name}`,
});
