import { Bar as HorizontalBar, Column, Line, Pie } from '@ant-design/charts';
import { useThemeMode } from '../../../theme/ThemeProvider';
import { CHART_COLORS, CHART_COLORS_DARK } from '../../../theme/tokens';

const useChartTheme = () => (useThemeMode().isDark ? 'classicDark' : 'classic');
const usePalette = () => (useThemeMode().isDark ? CHART_COLORS_DARK : CHART_COLORS);
/** The single series colour: the first data hue. */
const useSeriesColor = () => usePalette()[0];

interface Point {
  x: string;
  y: number;
}

export const LineChart = ({ data, height = 240 }: { data: Point[]; height?: number }) => (
  <Line
    data={data}
    xField="x"
    yField="y"
    height={height}
    autoFit
    theme={useChartTheme()}
    shapeField="smooth"
    style={{ stroke: useSeriesColor(), lineWidth: 2 }}
  />
);

interface Slice {
  type: string;
  value: number;
}

export const PieChart = ({ data, height = 240, colors }: { data: Slice[]; height?: number; colors?: string[] }) => {
  const palette = usePalette();
  return (
  <Pie
    data={data}
    angleField="value"
    colorField="type"
    height={height}
    autoFit
    theme={useChartTheme()}
    innerRadius={0.62}
    scale={{ color: { range: colors ?? palette } }}
    legend={{ color: { position: 'bottom' } }}
  />
  );
};

interface Bar {
  label: string;
  value: number;
}

export const ColumnChart = ({
  data,
  height = 240,
  single = false,
  colors,
}: {
  data: Bar[];
  height?: number;
  /** A colour per bar, in data order, when the bars have meanings of their own. */
  colors?: string[];
  /** One colour for every bar, for a series over time rather than categories. */
  single?: boolean;
}) => {
  const theme = useChartTheme();
  const series = useSeriesColor();
  const palette = usePalette();
  return (
  <Column
    data={data}
    xField="label"
    yField="value"
    colorField={single ? undefined : 'label'}
    height={height}
    autoFit
    theme={theme}
    scale={single ? undefined : { color: { range: colors ?? palette } }}
    style={single ? { fill: series, radiusTopLeft: 4, radiusTopRight: 4, maxWidth: 36 } : { radiusTopLeft: 4, radiusTopRight: 4, maxWidth: 56 }}
    axis={single ? { y: { labelFormatter: (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`) } } : undefined}
    legend={false}
  />
  );
};

/** Horizontal bars, for categories whose names are too long to sit under a column. */
export const BarChart = ({ data, height }: { data: Bar[]; height?: number }) => (
  <HorizontalBar
    data={data}
    xField="label"
    yField="value"
    colorField="label"
    height={height ?? Math.max(160, data.length * 40 + 40)}
    autoFit
    theme={useChartTheme()}
    scale={{ color: { range: usePalette() } }}
    style={{ radiusTopRight: 4, radiusBottomRight: 4, maxWidth: 24 }}
    legend={false}
    axis={{ x: { title: false }, y: { title: false } }}
  />
);
