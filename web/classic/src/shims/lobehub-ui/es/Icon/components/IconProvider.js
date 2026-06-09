import { createContext, useContext, memo } from 'react';

export var IconContext = createContext({});

export var IconProvider = memo(function IconProvider(props) {
  var children = props.children;
  var config = props.config !== undefined ? props.config : {};
  return <IconContext.Provider value={config}>{children}</IconContext.Provider>;
});

export function useIconContext() {
  return useContext(IconContext);
}
