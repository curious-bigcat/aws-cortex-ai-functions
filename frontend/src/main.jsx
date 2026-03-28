import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Amplify } from "aws-amplify";
import App from "./App";
import "./styles/index.css";

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || "",
      userPoolClientId: import.meta.env.VITE_COGNITO_APP_CLIENT_ID || "",
      loginWith: {
        oauth: {
          domain: import.meta.env.VITE_COGNITO_DOMAIN || "",
          scopes: ["openid", "email", "profile"],
          redirectSignIn: [window.location.origin + "/"],
          redirectSignOut: [window.location.origin + "/"],
          responseType: "code",
        },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
