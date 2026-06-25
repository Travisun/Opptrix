from __future__ import annotations
"""
配置中心 — YAML 驱动的全局配置

管理:
  - 评分卡权重与因子开关
  - 归一化方法选择
  - 异常值处理参数
  - 市场状态阈值
  - DCF 默认参数

用法:
    config = EvalConfig.load("~/.stock_eval/config.yaml")
    config.scorecard_weights["综合评估"]["roe"] = 0.12
    config.save()
"""

import os
import yaml
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field, asdict
from copy import deepcopy


DEFAULT_CONFIG_PATH = "~/.stock_eval/config.yaml"


@dataclass
class OutlierConfig:
    """异常值处理配置"""
    winsorize_pct: float = 1.0          # 两端截尾百分位
    clip_min: Optional[float] = None    # 硬性下限
    clip_max: Optional[float] = None    # 硬性上限
    missing_strategy: str = "skip"      # skip / mean / median / zero


@dataclass
class DCFConfig:
    """DCF 默认参数"""
    wacc: float = 0.10          # 加权平均资本成本 10%
    terminal_growth: float = 0.03  # 永续增长率 3%
    forecast_years: int = 5     # 预测年限
    growth_rate: float = 0.08   # 第一阶段增长率


@dataclass
class MarketRegimeConfig:
    """市场状态检测阈值"""
    bull_threshold: float = 0.02     # 20日涨幅 > 2% 为牛市
    bear_threshold: float = -0.02    # 20日涨幅 < -2% 为熊市
    high_vol_threshold: float = 0.25 # 年化波动 > 25% 为高波动
    low_vol_threshold: float = 0.12  # 年化波动 < 12% 为低波动
    heavy_volume_threshold: float = 1.3  # 量比 > 1.3 为放量


@dataclass
class EvalConfig:
    """全局评估配置"""

    # 评分卡权重（可覆盖内置模板）
    scorecard_weights: Dict[str, Dict[str, float]] = field(default_factory=dict)

    # 归一化方法选择
    default_normalization: str = "percentile"  # percentile / zscore / minmax

    # 行业中性化
    industry_neutralize: bool = True
    min_industry_size: int = 5

    # 子模块配置
    outlier: OutlierConfig = field(default_factory=OutlierConfig)
    dcf: DCFConfig = field(default_factory=DCFConfig)
    regime: MarketRegimeConfig = field(default_factory=MarketRegimeConfig)

    # 数据库路径
    store_path: str = "~/.stock_eval/store.db"

    # 调试
    verbose: bool = True

    # ── 加载与保存 ────────────────────────────────

    @classmethod
    def load(cls, path: Optional[str] = None) -> "EvalConfig":
        """从 YAML 加载配置，不存在则返回默认"""
        path = path or DEFAULT_CONFIG_PATH
        path = os.path.expanduser(path)
        if not os.path.exists(path):
            cfg = cls()
            cfg._path = path
            return cfg

        with open(path, "r") as f:
            data = yaml.safe_load(f) or {}

        cfg = cls()
        cfg._path = path
        if "scorecard_weights" in data:
            cfg.scorecard_weights = data["scorecard_weights"]
        if "default_normalization" in data:
            cfg.default_normalization = data["default_normalization"]
        if "industry_neutralize" in data:
            cfg.industry_neutralize = data["industry_neutralize"]
        if "min_industry_size" in data:
            cfg.min_industry_size = data["min_industry_size"]
        if "store_path" in data:
            cfg.store_path = data["store_path"]
        if "verbose" in data:
            cfg.verbose = data["verbose"]
        if "outlier" in data:
            for k, v in data["outlier"].items():
                if hasattr(cfg.outlier, k):
                    setattr(cfg.outlier, k, v)
        if "dcf" in data:
            for k, v in data["dcf"].items():
                if hasattr(cfg.dcf, k):
                    setattr(cfg.dcf, k, v)
        if "regime" in data:
            for k, v in data["regime"].items():
                if hasattr(cfg.regime, k):
                    setattr(cfg.regime, k, v)
        return cfg

    def save(self, path: Optional[str] = None):
        """保存到 YAML"""
        path = path or getattr(self, "_path", DEFAULT_CONFIG_PATH)
        path = os.path.expanduser(path)
        os.makedirs(os.path.dirname(path), exist_ok=True)

        data = {
            "scorecard_weights": self.scorecard_weights,
            "default_normalization": self.default_normalization,
            "industry_neutralize": self.industry_neutralize,
            "min_industry_size": self.min_industry_size,
            "store_path": self.store_path,
            "verbose": self.verbose,
            "outlier": asdict(self.outlier),
            "dcf": asdict(self.dcf),
            "regime": asdict(self.regime),
        }
        with open(path, "w") as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True)
        self._path = path

    def get_weight(self, scorecard: str, factor: str) -> float:
        """获取自定义权重，没有则返回 0 表示用默认"""
        return self.scorecard_weights.get(scorecard, {}).get(factor, 0.0)

    def to_dict(self) -> dict:
        return asdict(self)

    def __repr__(self):
        return f"<EvalConfig path={getattr(self, '_path', 'default')}>"


# 全局默认实例
DEFAULT_CONFIG = EvalConfig()
