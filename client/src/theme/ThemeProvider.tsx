import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd';
import enUS from 'antd/locale/en_US';
import { darkTheme, lightTheme } from './tokens';

type Mode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  mode: Mode;
  isDark: boolean;
  setMode: (mode: Mode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  isDark: false,
  setMode: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export const useThemeMode = () => useContext(ThemeContext);

const STORAGE_KEY = 'themeMode';

const readStoredMode = (): Mode => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    /* ignore */
  }
  return 'system';
};

const prefersDark = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-color-scheme: dark)').matches;

const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setModeState] = useState<Mode>(readStoredMode);
  const [systemDark, setSystemDark] = useState<boolean>(prefersDark);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const isDark = mode === 'dark' || (mode === 'system' && systemDark);

  const setMode = (next: Mode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }, [isDark]);

  const ctx = useMemo(() => ({ mode, isDark, setMode }), [mode, isDark]);

  const base = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={ctx}>
      <ConfigProvider
        locale={enUS}
        theme={{
          ...base,
          algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        }}
      >
        <AntdApp style={{ height: '100%' }}>{children}</AntdApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;
