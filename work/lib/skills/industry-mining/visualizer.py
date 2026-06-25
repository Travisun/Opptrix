#!/usr/bin/env python3
"""
产业投资挖掘 — 可视化报告生成器

生成 Mermaid 产业链全景图 + Matplotlib 数据分析图表
图表自动保存到临时目录，通过 Markdown 图片语法嵌入报告
"""

import os
import logging
from typing import Optional
from datetime import date

logger = logging.getLogger("industry_mining.viz")

# ── Temp dir for generated charts ──
CHART_DIR = "/tmp/astock_charts"
os.makedirs(CHART_DIR, exist_ok=True)

# ── Chart counter for unique filenames ──
_chart_counter = 0


def _next_chart_id(prefix: str) -> str:
    global _chart_counter
    _chart_counter += 1
    return f"{prefix}_{_chart_counter}.png"


# ══════════════════════════════════════════════════════════════════
# Mermaid 图表生成（零依赖，Codex 原生渲染）
# ══════════════════════════════════════════════════════════════════

def mermaid_industry_chain(industry_name: str, nodes: list, node_analysis: dict) -> str:
    """生成产业链全景图的 Mermaid 思维导图

    瓶颈环节标红，展示国产化率和瓶颈类型
    """
    lines = ["```mermaid", "mindmap"]
    root_label = industry_name.replace('"', "")
    lines.append(f"  root(({root_label}产业链))")

    # Group by upstream/midstream/downstream
    categories = {"上游": [], "中游": [], "下游": []}
    for node in nodes:
        pos = node.get("position", "")
        for cat in categories:
            if pos.startswith(cat):
                categories[cat].append(node)
                break

    for cat, cat_nodes in categories.items():
        if not cat_nodes:
            continue
        lines.append(f"    {cat}")
        for node in cat_nodes:
            pos = node.get("position", "").replace(cat + " — ", "")
            dr = node.get("domestic_rate", "")
            is_bn = node.get("bottleneck", False)
            companies = node_analysis.get(node["position"], [])
            comp_names = " ".join(
                c.get("name", "") for c in companies[:2]
            ) if companies else ""

            label = pos
            if dr:
                label += f" [{dr}]"
            if is_bn:
                label += " 🚨"
            if comp_names:
                label += f" ·{comp_names}"
            lines.append(f"      {label}")

    lines.append("```")
    return "\n".join(lines)


def mermaid_tech_generation(tech_generations: dict) -> str:
    """生成技术代际路线图的 Mermaid 流程图"""
    lines = ["```mermaid", "flowchart LR"]
    idx = 0
    for pos, gen in list(tech_generations.items())[:6]:
        steps = gen.split("→")
        prev_node = None
        for step in steps:
            step = step.strip()
            if not step:
                continue
            node_id = f"T{idx}"
            lines.append(f"    {node_id}[{step}]")
            if prev_node:
                lines.append(f"    {prev_node} --> {node_id}")
            prev_node = node_id
            idx += 1
    lines.append("```")
    return "\n".join(lines)


def mermaid_competition(competitive: dict, node_analysis: dict, top_n: int = 5) -> str:
    """生成竞争格局的 Mermaid 饼图模拟"""
    lines = ["```mermaid", "block-beta"]
    # Simple bar-like visualization using block-beta
    lines.append(f"  blockTitle: 竞争格局（{top_n}个关键环节）")
    lines.append("  columns 1")
    count = 0
    for pos, comp in competitive.items():
        if count >= top_n:
            break
        companies = node_analysis.get(pos, [])
        leader = comp.get("leader", "")
        conc = comp.get("concentration", "")
        label = f"{pos}: {conc} | 龙头: {leader}"
        lines.append(f"  block{count}")
        lines.append(f"    id{count}(\"{label}\")")
        lines.append(f"  end")
        count += 1
    lines.append("```")
    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════════
# Matplotlib 图表生成（需要 matplotlib）
# ══════════════════════════════════════════════════════════════════

def _ensure_matplotlib():
    """检查 matplotlib 可用性"""
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import matplotlib.font_manager as fm
        # Try to find Chinese font
        for fp in fm.findSystemFonts():
            for name in ['PingFang', 'Heiti', 'Noto Sans CJK', 'Source Han', 'STHeiti', 'Hiragino Sans']:
                if name.lower() in fp.lower():
                    plt.rcParams['font.family'] = fm.FontProperties(fname=fp).get_name()
                    break
            else:
                continue
            break
        plt.rcParams['axes.unicode_minus'] = False
        return True
    except ImportError:
        return False


def chart_value_chain(value_chain: list) -> tuple:
    """价值链分配 水平柱状图

    Returns:
        (markdown_image, chart_path) or (None, None) on failure
    """
    if not _ensure_matplotlib():
        return None, None

    import matplotlib.pyplot as plt
    import numpy as np

    fig, ax = plt.subplots(figsize=(10, 6))

    positions = [v.get("position", f"环节{i}")[:20] for i, v in enumerate(value_chain)]
    margins = [v.get("avg_gross_margin", 0) for v in value_chain]
    growths = [v.get("avg_growth", 0) for v in value_chain]

    y_pos = range(len(positions))
    bars = ax.barh(y_pos, margins, height=0.5, color='#2196F3', alpha=0.8, label='平均毛利率')
    ax.barh([y + 0.3 for y in y_pos], growths, height=0.3, color='#FF9800', alpha=0.7, label='营收增速')

    for i, (bar, m) in enumerate(zip(bars, margins)):
        ax.text(bar.get_width() + 0.5, bar.get_y() + bar.get_height() / 2,
                f'{m:.1f}%', va='center', fontsize=8)

    ax.set_yticks([y + 0.15 for y in y_pos])
    ax.set_yticklabels(positions, fontsize=9)
    ax.invert_yaxis()
    ax.set_xlabel('百分比 (%)')
    ax.set_title('产业链价值链分配（毛利率排序）', fontsize=13, fontweight='bold')
    ax.legend(loc='lower right', fontsize=9)
    ax.set_xlim(0, max(max(margins or [0]), max(growths or [0])) + 15)

    chart_path = os.path.join(CHART_DIR, _next_chart_id("value_chain"))
    plt.tight_layout()
    plt.savefig(chart_path, dpi=150, bbox_inches='tight')
    plt.close()

    md = f"![价值链分配]({chart_path})"
    return md, chart_path


def chart_bottleneck_quadrant(bottlenecks: list) -> tuple:
    """瓶颈四象限气泡图

    以 国产化率 为 X 轴、技术壁垒 为 Y 轴
    """
    if not _ensure_matplotlib():
        return None, None

    import matplotlib.pyplot as plt
    import numpy as np

    fig, ax = plt.subplots(figsize=(10, 7))

    # Parse domestic_rate to numeric
    nodes_data = []
    for b in bottlenecks:
        dr_str = b.get("domestic_rate", "0%").replace("%", "").strip()
        try:
            dr = float(dr_str)
        except ValueError:
            dr = 0
        barrier = b.get("barrier_score", 7.0)  # Default barrier score
        nodes_data.append({
            "name": b["position"][:25],
            "dr": dr,
            "barrier": barrier,
            "desc": b.get("type", "")[:30],
        })

    if not nodes_data:
        return None, None

    x = [n["dr"] for n in nodes_data]
    y = [n["barrier"] for n in nodes_data]
    colors = ['#e74c3c' if n["dr"] < 15 else '#f39c12' if n["dr"] < 30 else '#27ae60' for n in nodes_data]
    labels = [n["name"] for n in nodes_data]

    ax.scatter(x, y, s=800, c=colors, alpha=0.7, edgecolors='black', linewidth=1)

    for i, label in enumerate(labels):
        ax.annotate(label, (x[i], y[i]), fontsize=8, ha='center', va='bottom',
                    xytext=(0, 8), textcoords='offset points')

    ax.axvline(x=15, color='gray', linestyle='--', alpha=0.3, linewidth=0.8)
    ax.axvline(x=30, color='gray', linestyle='--', alpha=0.3, linewidth=0.8)
    ax.axhline(y=7, color='gray', linestyle='--', alpha=0.3, linewidth=0.8)

    ax.set_xlabel('国产化率 (%)', fontsize=11)
    ax.set_ylabel('技术壁垒 (1-10)', fontsize=11)
    ax.set_title('瓶颈环节四象限分析', fontsize=13, fontweight='bold')
    ax.set_xlim(-3, max(x) + 10)
    ax.set_ylim(3, 11)

    # Quadrant annotations
    ax.text(6, 10.2, '🔴 卡脖子区', fontsize=10, ha='center', color='#e74c3c', fontweight='bold')
    ax.text(50, 10.2, '🟡 改善区', fontsize=10, ha='center', color='#f39c12', fontweight='bold')
    ax.text(6, 3.8, '🟢 潜力区', fontsize=10, ha='center', color='#27ae60', fontweight='bold')

    chart_path = os.path.join(CHART_DIR, _next_chart_id("bottleneck"))
    plt.tight_layout()
    plt.savefig(chart_path, dpi=150, bbox_inches='tight')
    plt.close()

    md = f"![瓶颈四象限]({chart_path})"
    return md, chart_path


def chart_top_stocks(all_companies: list) -> tuple:
    """核心标的评分雷达图/柱状图

    Returns:
        (markdown_image, chart_path) or (None, None)
    """
    if not _ensure_matplotlib():
        return None, None

    import matplotlib.pyplot as plt
    import numpy as np

    top = all_companies[:6]
    if not top:
        return None, None

    fig, axes = plt.subplots(2, 3, figsize=(12, 8))
    axes = axes.flatten()

    for idx, (score, pos, comp) in enumerate(top):
        if idx >= 6:
            break
        ax = axes[idx]

        # Radar chart
        categories = ['毛利率', '增速', 'ROE', '增长率', '技术']
        values = [
            min(comp.get('gross_margin', 0) or 0, 80) / 80 * 100,
            min(max(comp.get('revenue_yoy', 0) or 0, -50), 100) / 100 * 100,
            min(comp.get('roe', 0) or 0, 30) / 30 * 100,
            50,  # placeholder for momentum
            50,  # placeholder for tech
        ]
        values += values[:1]  # close the radar

        angles = np.linspace(0, 2 * np.pi, len(categories), endpoint=False).tolist()
        angles += angles[:1]

        ax.plot(angles, values, 'o-', linewidth=2, color='#2196F3')
        ax.fill(angles, values, alpha=0.25, color='#2196F3')
        ax.set_xticks(angles[:-1])
        ax.set_xticklabels(categories, fontsize=7)
        ax.set_ylim(0, 100)
        ax.set_title(f"{comp.get('name','?')}", fontsize=10, fontweight='bold')

    # Hide unused subplots
    for idx in range(len(top), 6):
        axes[idx].axis('off')

    chart_path = os.path.join(CHART_DIR, _next_chart_id("top_stocks"))
    plt.tight_layout()
    plt.savefig(chart_path, dpi=150, bbox_inches='tight')
    plt.close()

    md = f"![核心标的雷达图]({chart_path})"
    return md, chart_path


def chart_summary(stats: dict) -> tuple:
    """生成综合看板图"""
    if not _ensure_matplotlib():
        return None, None

    import matplotlib.pyplot as plt
    import numpy as np

    fig, ax = plt.subplots(figsize=(8, 3))
    ax.axis('off')

    info_lines = [
        f"📊 {stats.get('industry', '行业')} 产业链分析摘要",
        f"  节点数: {stats.get('total_nodes', 0)} | 瓶颈: {stats.get('bottleneck_count', 0)}",
        f"  覆盖公司: {stats.get('company_count', 0)} | 高毛利环节: {stats.get('high_margin_count', 0)}",
        f"  生成时间: {date.today().isoformat()}",
    ]
    y_pos = 0.85
    for line in info_lines:
        ax.text(0.5, y_pos, line, fontsize=10, ha='center', va='center',
                transform=ax.transAxes, fontfamily='monospace')
        y_pos -= 0.18

    chart_path = os.path.join(CHART_DIR, _next_chart_id("summary"))
    plt.savefig(chart_path, dpi=120, bbox_inches='tight', facecolor='white')
    plt.close()

    md = f"![分析摘要]({chart_path})"
    return md, chart_path


# ══════════════════════════════════════════════════════════════════
# 统一生成接口
# ══════════════════════════════════════════════════════════════════

def generate_all_charts(
    industry_name: str,
    nodes: list,
    node_analysis: dict,
    value_chain: list,
    competitive: dict,
    bottlenecks: list,
    tech_generations: dict,
    all_companies: list,
    stats: Optional[dict] = None,
) -> dict:
    """统一生成所有可视化图表

    Returns:
        dict with keys:
            - mermaid_chain: str (Mermaid mindmap markdown)
            - mermaid_tech: str (Mermaid tech roadmap)
            - mermaid_competition: str (Mermaid competition map)
            - chart_value_chain: str (markdown image ref or "")
            - chart_bottleneck: str (markdown image ref or "")
            - chart_top_stocks: str (markdown image ref or "")
            - chart_summary: str (markdown image ref or "")
    """
    result = {}

    # Mermaid (zero dependency)
    result["mermaid_chain"] = mermaid_industry_chain(industry_name, nodes, node_analysis)
    result["mermaid_tech"] = mermaid_tech_generation(tech_generations) if tech_generations else ""
    result["mermaid_competition"] = mermaid_competition(competitive, node_analysis)

    # Matplotlib charts
    md, _ = chart_value_chain(value_chain)
    result["chart_value_chain"] = md or ""

    md, _ = chart_bottleneck_quadrant(bottlenecks)
    result["chart_bottleneck"] = md or ""

    md, _ = chart_top_stocks(all_companies)
    result["chart_top_stocks"] = md or ""

    if stats:
        md, _ = chart_summary(stats)
        result["chart_summary"] = md or ""

    return result


def render_charts_section(charts: dict) -> str:
    """将图表字典渲染为报告中的 Markdown 章节"""
    lines = []
    lines.append("## 📊 可视化分析")
    lines.append("")

    if charts.get("chart_summary"):
        lines.append(charts["chart_summary"])
        lines.append("")

    if charts.get("mermaid_chain"):
        lines.append("### 产业链全景图")
        lines.append("")
        lines.append(charts["mermaid_chain"])
        lines.append("")

    if charts.get("mermaid_tech"):
        lines.append("### 技术代际路线图")
        lines.append("")
        lines.append(charts["mermaid_tech"])
        lines.append("")

    if charts.get("chart_bottleneck"):
        lines.append("### 瓶颈四象限分析")
        lines.append("")
        lines.append(charts["chart_bottleneck"])
        lines.append("")

    if charts.get("chart_value_chain"):
        lines.append("### 价值链分配")
        lines.append("")
        lines.append(charts["chart_value_chain"])
        lines.append("")

    if charts.get("chart_top_stocks"):
        lines.append("### 核心标的对比")
        lines.append("")
        lines.append(charts["chart_top_stocks"])
        lines.append("")

    if charts.get("mermaid_competition"):
        lines.append("### 竞争格局概览")
        lines.append("")
        lines.append(charts["mermaid_competition"])
        lines.append("")

    lines.append("---")
    lines.append("")

    return "\n".join(lines)


if __name__ == "__main__":
    # Quick test
    print("Visualizer module OK")
    print(f"Chart dir: {CHART_DIR}")
    print(f"Matplotlib available: {_ensure_matplotlib()}")
