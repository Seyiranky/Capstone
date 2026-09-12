import type { ThemeConfig } from 'antd';

// Monochrome, editorial, low-chrome. White / grey / near-black. Sharp corners,
// hairline borders, no ambient card shadows. Light + dark; the sider follows
// the theme.

export const BRAND = {
  ink: '#18181b',
  inkHover: '#000000',
  siderDark: '#0b0b0d',
  contentLight: '#f5f5f6',
  contentDark: '#0f0f10',
  surfaceDark: '#161618',
  borderLight: '#e4e4e7',
  hairline: 'rgba(24,24,27,0.09)',
} as const;

export const CHART_COLORS = ['#18181b', '#52525b', '#8b8b93', '#b8b8bf', '#d8d8dd'];

const shared: ThemeConfig['token'] = {
  colorPrimary: BRAND.ink,
  colorInfo: BRAND.ink,
  colorLink: BRAND.ink,
  colorLinkHover: '#52525b',
  borderRadius: 4,
  borderRadiusLG: 6,
  borderRadiusSM: 3,
  controlHeight: 36,
  fontSize: 14,
  lineWidth: 1,
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  wireframe: false,
  boxShadow: 'none',
  boxShadowSecondary: '0 4px 16px rgba(24,24,27,0.08)',
  boxShadowTertiary: 'none',
};

const cardCfg = {
  borderRadiusLG: 6,
  headerFontSize: 14,
  headerHeight: 46,
  paddingLG: 20,
} as const;

export const lightTheme: ThemeConfig = {
  token: {
    ...shared,
    colorBgLayout: BRAND.contentLight,
    colorBorder: BRAND.borderLight,
    colorBorderSecondary: BRAND.borderLight,
  },
  components: {
    Layout: {
      headerBg: '#ffffff',
      headerHeight: 56,
      headerPadding: '0 18px',
      siderBg: '#ffffff',
      bodyBg: BRAND.contentLight,
    },
    Menu: {
      itemHeight: 40,
      itemBorderRadius: 4,
      itemSelectedBg: '#f4f4f5',
      itemSelectedColor: BRAND.ink,
      itemColor: '#3f3f46',
      itemHoverBg: '#fafafa',
      iconMarginInlineEnd: 10,
    },
    Card: { ...cardCfg, colorBorderSecondary: BRAND.borderLight },
    Table: {
      headerBg: '#fafafa',
      headerColor: '#52525b',
      borderColor: BRAND.borderLight,
      headerBorderRadius: 0,
      cellPaddingBlock: 12,
    },
    Statistic: { contentFontSize: 24, titleFontSize: 13 },
    Segmented: { itemSelectedColor: BRAND.ink, trackBg: '#efeff1', borderRadius: 4, borderRadiusSM: 3 },
    Button: { primaryShadow: 'none', defaultShadow: 'none' },
    Input: { activeShadow: 'none' },
  },
};

export const darkTheme: ThemeConfig = {
  token: {
    ...shared,
    colorPrimary: '#fafafa',
    colorInfo: '#fafafa',
    colorLink: '#fafafa',
    colorLinkHover: '#d4d4d8',
    colorBgLayout: BRAND.contentDark,
  },
  components: {
    Layout: {
      headerBg: BRAND.surfaceDark,
      headerHeight: 56,
      headerPadding: '0 18px',
      siderBg: BRAND.siderDark,
      bodyBg: BRAND.contentDark,
    },
    Menu: {
      darkItemBg: BRAND.siderDark,
      darkSubMenuItemBg: BRAND.siderDark,
      darkItemSelectedBg: 'rgba(255,255,255,0.1)',
      darkItemHoverBg: 'rgba(255,255,255,0.06)',
      itemHeight: 40,
      itemBorderRadius: 4,
    },
    Card: cardCfg,
    Statistic: { contentFontSize: 24, titleFontSize: 13 },
    Button: { primaryShadow: 'none', defaultShadow: 'none' },
  },
};
