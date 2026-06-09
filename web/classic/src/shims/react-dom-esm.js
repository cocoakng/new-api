// ESM wrapper for react-dom
// react-dom is a CJS module; this wrapper ensures named exports work with ESM bundlers
import ReactDOM from 'react-dom';

// Re-export all named exports from the CJS default
export const findDOMNode = ReactDOM.findDOMNode;
export const createPortal = ReactDOM.createPortal;
export const flushSync = ReactDOM.flushSync;
export const unstable_batchedUpdates = ReactDOM.unstable_batchedUpdates;
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = ReactDOM.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
export const version = ReactDOM.version;
export const render = ReactDOM.render;
export const hydrate = ReactDOM.hydrate;
export const unmountComponentAtNode = ReactDOM.unmountComponentAtNode;
export const createFactory = ReactDOM.createFactory;

// React 18 client APIs
export const createRoot = ReactDOM.createRoot;
export const hydrateRoot = ReactDOM.hydrateRoot;

// Default export
export default ReactDOM;
