import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import App from "./App";
import "./styles.css";

function Root() {
  const [dark, setDark] = React.useState(() => {
    try { return localStorage.getItem("viaweb-theme") === "dark"; } catch { return false; }
  });
  const theme = React.useMemo(() => createTheme({
  palette: {
    mode: dark ? "dark" : "light",
    primary: { main: dark ? "#84c9dd" : "#22577a" },
    secondary: { main: "#c75146" },
    background: dark ? { default: "#151719", paper: "#202326" } : { default: "#f5f7f8" }
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
    h4: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 700, letterSpacing: 0 }
  }
  }), [dark]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App dark={dark} onToggleTheme={() => {
        setDark(!dark);
        try { localStorage.setItem("viaweb-theme", dark ? "light" : "dark"); } catch {}
      }} />
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
