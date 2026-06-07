import { t } from 'i18next';
import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { ChartConfig } from '../../types';

interface ChartRendererProps {
  data: any;
  config: ChartConfig;
  className?: string;
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({ data, config, className }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current || !data) return;

    // Initialize or get chart instance
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    // Generate chart options based on config
    const option = generateChartOption(data, config);

    // Set chart options
    chartInstance.current.setOption(option, true);

    // Resize chart when window resizes
    const handleResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [data, config]);

  useEffect(() => {
    return () => {
      // Destroy chart instance on unmount
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={chartRef}
      className={className || 'w-full h-96'}
      style={{ minHeight: '300px' }}
    />
  );
};

// Generate ECharts options based on config
function generateChartOption(data: any, config: ChartConfig): echarts.EChartsOption {
  const { type, title, xAxis, yAxis } = config;

  const baseOption: echarts.EChartsOption = {
    title: {
      text: title || t('chart.defaultTitle'),
      left: 'center',
    },
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      top: 'bottom',
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '10%',
      containLabel: true,
    },
  };

  // Generate different configs based on chart type
  switch (type) {
    case 'line':
      return {
        ...baseOption,
        xAxis: {
          type: 'category',
          data: data.map((item: any) => item[xAxis || Object.keys(item)[0]]),
        },
        yAxis: {
          type: 'value',
        },
        series: [
          {
            name: yAxis || 'Value',
            type: 'line',
            data: data.map((item: any) => item[yAxis || Object.keys(item)[1]]),
            smooth: true,
          },
        ],
      };

    case 'bar':
      return {
        ...baseOption,
        xAxis: {
          type: 'category',
          data: data.map((item: any) => item[xAxis || Object.keys(item)[0]]),
        },
        yAxis: {
          type: 'value',
        },
        series: [
          {
            name: yAxis || 'Value',
            type: 'bar',
            data: data.map((item: any) => item[yAxis || Object.keys(item)[1]]),
          },
        ],
      };

    case 'pie':
      return {
        ...baseOption,
        tooltip: {
          trigger: 'item',
          formatter: '{a} <br/>{b}: {c} ({d}%)',
        },
        series: [
          {
            name: title || t('chart.dataDistribution'),
            type: 'pie',
            radius: '50%',
            data: data.map((item: any) => ({
              name: item[xAxis || Object.keys(item)[0]],
              value: item[yAxis || Object.keys(item)[1]],
            })),
          },
        ],
      };

    case 'scatter':
      return {
        ...baseOption,
        xAxis: {
          type: 'value',
        },
        yAxis: {
          type: 'value',
        },
        series: [
          {
            name: title || t('chart.scatterPlot'),
            type: 'scatter',
            data: data.map((item: any) => [
              item[xAxis || Object.keys(item)[0]],
              item[yAxis || Object.keys(item)[1]],
            ]),
          },
        ],
      };

    default:
      return baseOption;
  }
} 