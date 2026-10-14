import { Config } from "@remotion/cli/config";

// The default headless shell crashes on this macOS (icudtl.dat); Chrome for Testing works.
Config.setChromeMode("chrome-for-testing");
