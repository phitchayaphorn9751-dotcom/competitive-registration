import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import App from "./App.jsx"
import { LangProvider } from "./lib/i18n.jsx"
import { DialogProvider } from "./lib/dialog.jsx"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LangProvider>
        <DialogProvider>
          <App />
        </DialogProvider>
      </LangProvider>
    </BrowserRouter>
  </React.StrictMode>
)