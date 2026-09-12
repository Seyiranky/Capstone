import { Column, Line, Pie } from '@ant-design/charts';
import { useThemeMode } from '../../../theme/ThemeProvider';
import { CHART_COLORS } from '../../../theme/tokens';

const useChartTheme = () => (useThemeMode().isDark ? 'classicDark' : 'classic');

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
    style={{ stroke: CHART_COLORS[0], lineWidth: 2 }}
  />
);

interface Slice {
  type: string;
  value: number;
}

export const PieChart = ({ data, height = 240 }: { data: Slice[]; height?: number }) => (
  <Pie
    data={data}
    angleField="value"
    colorField="type"
    height={height}
    autoFit
    theme={useChartTheme()}
    innerRadius={0.62}
    scale={{ color: { range: CHART_COLORS } }}
    legend={{ color: { position: 'bottom' } }}
  />
);

interface Bar {
  label: string;
  value: number;
}

export const ColumnChart = ({ data, height = 240 }: { data: Bar[]; height?: number }) => (
  <Column
    data={data}
    xField="label"
    yField="value"
    colorField="label"
    height={height}
    autoFit
    theme={useChartTheme()}
    scale={{ color: { range: CHART_COLORS } }}
    legend={false}
  />
);
