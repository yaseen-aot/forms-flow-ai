import React from "react";
import ReactDOM from "react-dom";
import singleSpaReact from "single-spa-react";
import App from "./components/App";
import StoreService from "./services/StoreService";
import { featureFlags } from "./featureToogle";
import { FlagsProvider } from "flagged";
import { Formio, Components } from "@aot-technologies/formio-react";
import { AppConfig } from "./config";
import "./resourceBundles/i18n.js";
import "./integrations/ehr/epicConsent";

if (typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ === "object") {
  for (let [key, value] of Object.entries(
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__
  )) {
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__[key] =
      typeof value == "function" ? () => {} : null;
  }
}
Formio.setProjectUrl(AppConfig.projectUrl);
Formio.setBaseUrl(AppConfig.apiUrl);

// Make UserDetails available to Form.io custom condition evaluations
// This allows customConditional scripts to access UserDetails
if (typeof window !== 'undefined') {
  try {
    const userDetailsStr = localStorage.getItem('UserDetails');
    if (userDetailsStr) {
      window.UserDetails = JSON.parse(userDetailsStr);
    }
    
    // Update UserDetails when localStorage changes
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      originalSetItem.apply(this, arguments);
      if (key === 'UserDetails') {
        try {
          window.UserDetails = value ? JSON.parse(value) : null;
        } catch (e) {
          window.UserDetails = null;
        }
      }
    };
  } catch (e) {
    console.warn('Failed to initialize UserDetails for Form.io:', e);
    window.UserDetails = null;
  }
}

// Set custom formio elements - Code splitted
import(
  "@aot-technologies/formsflow-formio-custom-elements/dist/customformio-ex"
).then((FormioCustomEx) => {
  Components.setComponents(FormioCustomEx.components);
});

const createRootComponent = (props) => {
  const { publish, subscribe, getKcInstance } = props;
  const store = StoreService.configureStore();
  const history = StoreService.history;
  return (
    <FlagsProvider features={featureFlags}>
      <App {...{ store, history, publish, subscribe, getKcInstance }} />
    </FlagsProvider>
  );
};

const reactLifecycles = singleSpaReact({
  React,
  ReactDOM,
  rootComponent: createRootComponent,
  errorBoundary() {
    return <div>This renders when a catastrophic error occurs</div>;
  },
  renderType: "render",
});

export const { bootstrap, mount, unmount } = reactLifecycles;
