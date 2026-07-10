const pkg = require('../package.json')

const APP_NAME = 'Opptrix'
const APP_TITLE = 'Opptrix'
const APP_TAGLINE = '全球多市场投研数据助手'
const PROJECT_START_YEAR = 2026
const AUTHOR_NAME = 'Opptrix contributors'
const AUTHOR_EMAIL = 'imsorich@foxmail.com'
const GITHUB_HOME = 'https://github.com/Travisun/Opptrix'
const GITHUB_ISSUES = 'https://github.com/Travisun/Opptrix/issues'
const COPYRIGHT = `Copyright © ${PROJECT_START_YEAR} ${AUTHOR_NAME}`
const VERSION = pkg.version

module.exports = {
  APP_NAME,
  APP_TITLE,
  APP_TAGLINE,
  AUTHOR_NAME,
  AUTHOR_EMAIL,
  GITHUB_HOME,
  GITHUB_ISSUES,
  COPYRIGHT,
  VERSION,
}
