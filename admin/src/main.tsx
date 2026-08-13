import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import { BRAND } from './brand'
import { ThemeProvider, useTheme, type ThemeMode } from './theme'
import './styles.css'

function brandTheme(mode: ThemeMode) {
  const dark = mode === 'dark'
  return {
    algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: BRAND.cobalt,
      colorInfo: BRAND.cobalt,
      colorLink: BRAND.cobalt,
      colorLinkHover: BRAND.cobaltLight,
      colorBgLayout: dark ? '#101114' : BRAND.layoutBg,
      colorBgContainer: dark ? '#17181B' : BRAND.white,
      colorText: dark ? '#F2F3F5' : BRAND.textPrimary,
      colorTextSecondary: dark ? '#9BA1AB' : BRAND.textSecondary,
      colorBorder: dark ? '#2A2D33' : '#D9DCE1',
      colorBorderSecondary: dark ? '#26282D' : BRAND.border,
      borderRadius: 10,
      borderRadiusLG: 18,
      fontFamily:
        '"SF Pro Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif',
    },
    components: {
      Layout: {
        siderBg: dark ? BRAND.coreBlack : '#FFFFFF',
        headerBg: dark ? '#17181B' : BRAND.white,
        headerHeight: 56,
        headerPadding: '0 20px',
      },
      Menu: dark
        ? {
            darkItemBg: BRAND.coreBlack,
            darkSubMenuItemBg: BRAND.coreBlack,
            darkItemColor: 'rgba(255, 255, 255, 0.72)',
            darkItemHoverColor: '#FFFFFF',
            darkItemHoverBg: 'rgba(255, 255, 255, 0.08)',
            darkItemSelectedBg: 'rgba(0, 71, 171, 0.32)',
            darkItemSelectedColor: '#FFFFFF',
            darkActiveBarBg: 'transparent',
            activeBarBorderWidth: 0,
            itemBorderRadius: 10,
            itemMarginInline: 10,
            itemMarginBlock: 4,
            iconSize: 16,
          }
        : {
            itemBg: 'transparent',
            itemColor: '#3B3B3B',
            itemHoverColor: BRAND.cobalt,
            itemHoverBg: 'rgba(0, 71, 171, 0.06)',
            itemSelectedBg: 'rgba(0, 71, 171, 0.1)',
            itemSelectedColor: BRAND.cobalt,
            activeBarBg: 'transparent',
            activeBarBorderWidth: 0,
            itemBorderRadius: 10,
            itemMarginInline: 10,
            itemMarginBlock: 4,
            iconSize: 16,
          },
      Card: {
        borderRadiusLG: 20,
        borderRadiusSM: 12,
        headerFontSize: 16,
      },
      Table: {
        headerBg: dark ? '#1E2024' : '#F7F8FA',
        headerColor: dark ? '#C9CDD3' : BRAND.charcoal,
        headerSplitColor: 'transparent',
        rowHoverBg: dark ? '#1E222A' : '#F5F8FD',
        cellPaddingBlock: 12,
      },
      Button: {
        borderRadius: 10,
        fontWeight: 500,
      },
      Segmented: {
        itemSelectedBg: BRAND.cobalt,
        itemSelectedColor: '#FFFFFF',
      },
      Modal: {
        borderRadiusLG: 20,
      },
    },
  }
}

function ThemedApp() {
  const { mode } = useTheme()
  return (
    <ConfigProvider locale={zhCN} theme={brandTheme(mode)}>
      <App />
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  </React.StrictMode>,
)
