import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import App from "./App";
import "./styles.css";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#22577a" },
    secondary: { main: "#c75146" },
    background: { default: "#f5f7f8" }
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
    h4: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 700, letterSpacing: 0 }
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
