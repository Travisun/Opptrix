"""a_stock_layer — AStockLayer 数据层"""

from setuptools import find_packages, setup

setup(
    name="a-stock-layer",
    version="1.0.0",
    description="你的A股投资研究助手。想看什么数据，问一声就有。",
    long_description="把A股投资需要的数据统统放到你面前。从个股行情、资金流向、大盘指数，到公司财务三张表、管理层信息、股东增减持计划，再到涨停跌停名单、可转债行情、全球指数、宏观经济数据——39个维度覆盖一只股票的全部故事。数据自动更新，多源交叉验证，你只管研究，不用操心数据从哪里来。",
    author="A股分析助理",
    packages=find_packages(include=["a_stock_layer", "a_stock_layer.*"]),
    install_requires=[
        "requests>=2.28.0",
        "mootdx>=0.10.0",
        "efinance>=0.5.0",
        "pandas>=1.5.0",
    ],
    python_requires=">=3.9",
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Financial and Insurance Industry",
        "Topic :: Office/Business :: Financial :: Investment",
    ],
)
