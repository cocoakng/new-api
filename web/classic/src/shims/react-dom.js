// react-dom shim for React 19 + semi-ui compatibility
// Uses dynamic require to bypass rspack static analysis and avoid circular redirection.
// The NormalModuleReplacementPlugin only catches static ESM imports.

// These functions exist on the CJS react-dom module.exports at runtime
// but we don't import them statically to avoid rspack redirecting to this shim.
const ReactDOM = require('react-dom');
const { createRoot, flushSync } = require('react-dom/client');

// createPortal was moved from react-dom/client back to react-dom in React 19
const createPortal = ReactDOM.createPortal;

// findDOMNode was removed in React 19, but @douyinfe/semi-ui still uses it
const findDOMNode = function(componentOrElement) {
  if (componentOrElement == null) return null;
  if (componentOrElement.nodeType !== undefined) return componentOrElement;
  try {
    var fiber = componentOrElement._reactInternals;
    if (fiber == null) return null;
    var stateNode = fiber.stateNode;
    while (stateNode && stateNode.nodeType === undefined) {
      fiber = fiber.child;
      if (fiber == null) return null;
      stateNode = fiber.stateNode;
    }
    return stateNode;
  } catch(e) {
    return null;
  }
};

// ReactDOM.render was removed in React 19 — replace with createRoot
const rootMap = new Map();

const render = function(element, container, callback) {
  let root = rootMap.get(container);
  if (!root) {
    root = createRoot(container);
    rootMap.set(container, root);
  }
  root.render(element);
  if (callback) {
    setTimeout(callback, 0);
  }
};

// ReactDOM.unmountComponentAtNode was removed in React 19
const unmountComponentAtNode = function(container) {
  const root = rootMap.get(container);
  if (root) {
    root.unmount();
    rootMap.delete(container);
  }
};

// Named exports
module.exports = {
  findDOMNode,
  createPortal,
  flushSync,
  unstable_batchedUpdates: ReactDOM.unstable_batchedUpdates,
  version: ReactDOM.version,
  render,
  unmountComponentAtNode,
  createRoot,
  hydrateRoot: ReactDOM.hydrateRoot,
  hydrate: ReactDOM.hydrate,
  createFactory: ReactDOM.createFactory,
  default: null, // set below
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: ReactDOM.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
};

module.exports.default = module.exports;
