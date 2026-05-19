import { useEffect, useState, useRef } from 'react'
import Head from 'next/head'

function processData(records) {
  const total = records.length
  const majorCount = records.filter(r => r.sensitivity === 'Major').length
  const compensationCount = records.filter(r =>
    (r.handling || '').includes('赔偿') ||
    (r.handling || '').toLowerCase().includes('compensation')
  ).length

  const byVarian = {}, byL1 = {}, byFactory = {}, byProvince = {}, byMonth = {}
  const majorByVarian = {}

  records.forEach(r => {
    const v = r.varian || '未知'
    byVarian[v] = (byVarian[v] || 0) + 1
    if (r.sensitivity === 'Major') majorByVarian[v] = (majorByVarian[v] || 0) + 1

    const l1 = r.level1 || '未知'
    byL1[l1] = (byL1[l1] || 0) + 1

    const f = r.factory || '未知'
    byFactory[f] = (byFactory[f] || 0) + 1

    const p = r.province || '未知'
    if (p && p !== '未知') byProvince[p] = (byProvince[p] || 0) + 1

    if (r.date) {
      const ts = typeof r.date === 'number' ? r.date : Date.parse(r.date)
      if (!isNaN(ts)) {
        const d = new Date(ts)
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        byMonth[month] = (byMonth[month] || 0) + 1
      }
    }
  })

  return {
    total,
    majorCount,
    compensationCount,
    majorRate: total > 0 ? (majorCount / total * 100).toFixed(1) : '0',
    compensationRate: total > 0 ? (compensationCount / total * 100).toFixed(1) : '0',
    byVarian: Object.entries(byVarian).sort((a, b) => b[1] - a[1]).slice(0, 8),
    majorByVarian,
    byL1: Object.entries(byL1).sort((a, b) => b[1] - a[1]).slice(0, 6),
    byFactory: Object.entries(byFactory).sort((a, b) => b[1] - a[1]),
    byProvince: Object.entries(byProvince).sort((a, b) => b[1] - a[1]).slice(0, 10),
    byMonth: Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])),
  }
}

function renderCharts(stats) {
  const Chart = window.Chart
  const COLORS = ['#1890ff', '#ff4d4f', '#52c41a', '#faad14', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911']

  // 各产品线投诉量（横向柱状图）
  const varianEl = document.getElementById('varianChart')
  if (varianEl) {
    new Chart(varianEl, {
      type: 'bar',
      data: {
        labels: stats.byVarian.map(v => v[0]),
        datasets: [
          {
            label: 'Major',
            data: stats.byVarian.map(v => stats.majorByVarian[v[0]] || 0),
            backgroundColor: '#ff4d4f',
          },
          {
            label: 'Minor',
            data: stats.byVarian.map(v => v[1] - (stats.majorByVarian[v[0]] || 0)),
            backgroundColor: '#91caff',
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: { x: { stacked: true }, y: { stacked: true } },
      },
    })
  }

  // 投诉类型分布（环形图）
  const l1El = document.getElementById('l1Chart')
  if (l1El) {
    new Chart(l1El, {
      type: 'doughnut',
      data: {
        labels: stats.byL1.map(v => v[0]),
        datasets: [{ data: stats.byL1.map(v => v[1]), backgroundColor: COLORS }],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'right' } },
      },
    })
  }

  // 工厂对比
  const factoryEl = document.getElementById('factoryChart')
  if (factoryEl) {
    new Chart(factoryEl, {
      type: 'bar',
      data: {
        labels: stats.byFactory.map(v => v[0]),
        datasets: [{
          label: '投诉数量',
          data: stats.byFactory.map(v => v[1]),
          backgroundColor: COLORS,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
      },
    })
  }

  // 省份 TOP10（横向）
  const provinceEl = document.getElementById('provinceChart')
  if (provinceEl) {
    new Chart(provinceEl, {
      type: 'bar',
      data: {
        labels: stats.byProvince.map(v => v[0]),
        datasets: [{
          label: '投诉数量',
          data: stats.byProvince.map(v => v[1]),
          backgroundColor: '#1890ff',
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { display: false } },
      },
    })
  }

  // 月度趋势
  if (stats.byMonth.length > 1) {
    const trendEl = document.getElementById('trendChart')
    if (trendEl) {
      new Chart(trendEl, {
        type: 'line',
        data: {
          labels: stats.byMonth.map(v => v[0]),
          datasets: [{
            label: '月度投诉量',
            data: stats.byMonth.map(v => v[1]),
            borderColor: '#1890ff',
            backgroundColor: 'rgba(24,144,255,0.1)',
            fill: true,
            tension: 0.3,
          }],
        },
        options: { responsive: true },
      })
    }
  }
}

export default function Report() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [generatedAt, setGeneratedAt] = useState('')
  const chartLoaded = useRef(false)

  useEffect(() => {
    setGeneratedAt(new Date().toLocaleString('zh-CN'))
    fetch('/api/get-records')
      .then(r => r.json())
      .then(d => {
        setStats(processData(d.records))
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!stats || chartLoaded.current) return
    chartLoaded.current = true
    if (window.Chart) {
      renderCharts(stats)
    } else {
      const s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4'
      s.onload = () => renderCharts(stats)
      document.head.appendChild(s)
    }
  }, [stats])

  return (
    <>
      <Head>
        <title>MAKUKU 质量投诉分析报告</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #f0f2f5; font-family: -apple-system, 'PingFang SC', sans-serif; }
          .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
          .header { margin-bottom: 24px; }
          .header h1 { font-size: 26px; font-weight: 700; color: #1f3864; }
          .header p { color: #999; margin-top: 4px; font-size: 13px; }
          .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
          .kpi-card { background: #fff; border-radius: 8px; padding: 20px 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
          .kpi-value { font-size: 38px; font-weight: 700; color: #1f3864; line-height: 1; }
          .kpi-label { font-size: 13px; color: #888; margin-top: 6px; }
          .kpi-sub { font-size: 12px; margin-top: 4px; font-weight: 600; }
          .charts-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 16px; }
          .chart-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
          .chart-card h3 { font-size: 15px; color: #333; margin-bottom: 16px; font-weight: 600; }
          .chart-wide { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-bottom: 16px; }
          .chart-wide h3 { font-size: 15px; color: #333; margin-bottom: 16px; font-weight: 600; }
          .center { display: flex; align-items: center; justify-content: center; height: 100vh; font-size: 18px; color: #666; }
          @media (max-width: 768px) {
            .kpi-grid { grid-template-columns: repeat(2, 1fr); }
            .charts-grid { grid-template-columns: 1fr; }
          }
        `}</style>
      </Head>

      {loading && <div className="center">⏳ 数据加载中，请稍候...</div>}
      {error && <div className="center" style={{ color: 'red' }}>❌ 加载失败：{error}</div>}

      {stats && (
        <div className="container">
          <div className="header">
            <h1>📊 MAKUKU 质量投诉分析报告</h1>
            <p>数据实时来源于飞书多维表格 · 生成时间：{generatedAt}</p>
          </div>

          <div className="kpi-grid">
            <div className="kpi-card" style={{ borderTop: '4px solid #1890ff' }}>
              <div className="kpi-value">{stats.total}</div>
              <div className="kpi-label">总投诉工单数</div>
            </div>
            <div className="kpi-card" style={{ borderTop: '4px solid #ff4d4f' }}>
              <div className="kpi-value">{stats.majorCount}</div>
              <div className="kpi-label">Major 级别</div>
              <div className="kpi-sub" style={{ color: '#ff4d4f' }}>占比 {stats.majorRate}%</div>
            </div>
            <div className="kpi-card" style={{ borderTop: '4px solid #faad14' }}>
              <div className="kpi-value">{stats.compensationCount}</div>
              <div className="kpi-label">赔偿处理数</div>
              <div className="kpi-sub" style={{ color: '#faad14' }}>占比 {stats.compensationRate}%</div>
            </div>
            <div className="kpi-card" style={{ borderTop: '4px solid #52c41a' }}>
              <div className="kpi-value">{stats.byFactory.length}</div>
              <div className="kpi-label">涉及工厂数</div>
              <div className="kpi-sub" style={{ color: '#52c41a' }}>{stats.byFactory.map(f => f[0]).join(' / ')}</div>
            </div>
          </div>

          <div className="charts-grid">
            <div className="chart-card">
              <h3>🏷️ 各产品线投诉量（Major / Minor）</h3>
              <canvas id="varianChart" height="220" />
            </div>
            <div className="chart-card">
              <h3>📋 投诉类型分布（一级分类）</h3>
              <canvas id="l1Chart" height="220" />
            </div>
            <div className="chart-card">
              <h3>🏭 各工厂投诉对比</h3>
              <canvas id="factoryChart" height="220" />
            </div>
            <div className="chart-card">
              <h3>📍 省份投诉 TOP10</h3>
              <canvas id="provinceChart" height="220" />
            </div>
          </div>

          {stats.byMonth.length > 1 && (
            <div className="chart-wide">
              <h3>📈 月度投诉趋势</h3>
              <canvas id="trendChart" height="100" />
            </div>
          )}
        </div>
      )}
    </>
  )
}
