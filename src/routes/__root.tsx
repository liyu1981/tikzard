import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AmbientBackground } from "@/components/ambient-background";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/i18n/provider";

export const Route = createRootRoute({
  component: RootLayout,
});

/** App-wide providers + ambient chrome shared by every route. */
function RootLayout() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AmbientBackground />
        <Outlet />
      </I18nProvider>
    </ThemeProvider>
  );
}
