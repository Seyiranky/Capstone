import type { ThemeConfig } from 'antd';

// Isoko's palette: the navy of the logo's wordmark carries actions and
// selection; everything else is neutral, on a plain white page. Status colours
// (green, amber, red) are kept for meaning only. Light + dark; the sider follows
// the theme.

export const BRAND = {
  navy: '#1E3A5F',
  navyHover: '#15304F',
  navySoft: '#EEF2F7',
  ink: '#101828',
  inkHover: '#000000',
  siderDark: '#0E1116',
  contentLight: '#FFFFFF',
  contentDark: '#0E1116',
  surfaceDark: '#151A21',
  borderLight: '#E4E7EC',
  hairline: 'rgba(16,24,40,0.08)',
} as const;

export const CHART_COLORS = ['#1E3A5F', '#4C6E96', '#8FA9C8', '#B5562F', '#C9CED6'];

const shared: ThemeConfig['token'] = {
  colorPrimary: BRAND.navy,
  colorInfo: BRAND.navy,
  colorLink: BRAND.navy,
  colorLinkHover: '#2F5A8C',
  borderRadius: 6,
  borderRadiusLG: 10,
  borderRadiusSM: 4,
  controlHeight: 36,
  fontSize: 14,
  lineWidth: 1,
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  wireframe: false,
  boxShadow: 'none',
  boxShadowSecondary: '0 4px 16px rgba(16,24,40,0.08)',
  boxShadowTertiary: 'none',
};

const cardCfg = {
  borderRadiusLG: 10,
  headerFontSize: 15,
  headerHeight: 46,
  paddingLG: 20,
} as const;

export const lightTheme: ThemeConfig = {
  token: {
    ...shared,
    colorBgLayout: BRAND.contentLight,
    colorText: BRAND.ink,
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
      itemSelectedBg: BRAND.navySoft,
      itemSelectedColor: BRAND.navy,
      itemColor: '#344054',
      itemHoverBg: '#F5F7FA',
      groupTitleColor: '#98A2B3',
      groupTitleFontSize: 11,
      iconMarginInlineEnd: 10,
    },
    Card: { ...cardCfg, colorBorderSecondary: BRAND.borderLight },
    Table: {
      headerBg: '#F9FAFB',
      headerColor: '#475467',
      borderColor: BRAND.borderLight,
      headerBorderRadius: 0,
      cellPaddingBlock: 12,
    },
    Statistic: { contentFontSize: 24, titleFontSize: 13 },
    Segmented: { itemSelectedColor: BRAND.navy, trackBg: '#F2F4F7', borderRadius: 6, borderRadiusSM: 4 },
    Button: { primaryShadow: 'none', defaultShadow: 'none' },
    Input: { activeShadow: 'none' },
  },
};

export const darkTheme: ThemeConfig = {
  token: {
    ...shared,
    colorPrimary: '#7FA6D6',
    colorInfo: '#7FA6D6',
    colorLink: '#9DBBE0',
    colorLinkHover: '#C3D6EE',
    colorBgLayout: BRAND.contentDark,
    // Explicit, because the shared tokens must not carry a light-theme text colour.
    colorText: '#E7EBF2',
    colorTextSecondary: '#A9B1BF',
    colorTextTertiary: '#8A93A3',
    colorBgContainer: BRAND.surfaceDark,
    colorBgElevated: '#1B212A',
    colorBorder: '#2A313C',
    colorBorderSecondary: '#232933',
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
      darkItemSelectedBg: 'rgba(127,166,214,0.16)',
      darkItemSelectedColor: '#ffffff',
      groupTitleColor: '#7A8494',
      groupTitleFontSize: 11,
      darkItemHoverBg: 'rgba(255,255,255,0.06)',
      itemHeight: 40,
      itemBorderRadius: 4,
    },
    Card: cardCfg,
    Statistic: { contentFontSize: 24, titleFontSize: 13 },
    Button: { primaryShadow: 'none', defaultShadow: 'none' },
  },
};
