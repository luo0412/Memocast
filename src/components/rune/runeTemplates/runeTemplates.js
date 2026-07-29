// ============================================================================
// runeTemplates —— 14 个内置 rune 模板（系统提供，固定不可删改）
//
// 每个 createXxxTemplate() 产出的是一段字符串形式的 Vue SFC，
// 由 mountRuneVueHosts 在编辑区实例化为可交互 rune 卡片。
//
// 拆分后目录结构（位于 ./runeTemplates/）：
//   - runeTemplatesBlank.js                    createBlankTemplate()       空白模板
//   - runeTemplatesInheritDemo.js              createInheritDemoTemplate() inheritFromPrevious 演示
//   - runeTemplatesInput.js                    createInputTemplate()       输入框（基础）
//   - runeTemplatesHolyShield.js               createHolyShieldTemplate()  hel-micro 远程加载
//   - runeTemplatesFirefly.js                  createFireflyTemplate()     萤火虫动画
//   - runeTemplatesJsxGraph.js                 createJsxGraphTemplate()    JSXGraph 坐标板
//   - runeTemplatesElInput.js                  createElInputTemplate()     el-input 包装
//   - runeTemplatesElSelect.js                 createElSelectTemplate()    el-select 包装
//   - runeTemplatesElDatePicker.js             createElDatePickerTemplate() el-date-picker 包装
//   - runeTemplatesResumeBasicInfo.js          createResumeBasicInfoTemplate()  简历基本信息
//   - runeTemplatesResumeTitle.js              createResumeTitleTemplate()      简历标题
//   - runeTemplatesResumeExperience.js         createResumeExperienceTemplate() 简历经历
//   - runeTemplatesResumeText.js               createResumeTextTemplate()       简历自由文本
//   - runeTemplatesResumeSkill.js              createResumeSkillTemplate()      简历技能条
//
// 外部 API 保持与原 rune-templates.js 一致：14 个 create*Template() 函数。
// ============================================================================

import runeTemplatesBlank from './runeTemplatesBlank.js'
import runeTemplatesInheritDemo from './runeTemplatesInheritDemo.js'
import runeTemplatesInput from './runeTemplatesInput.js'
import runeTemplatesHolyShield from './runeTemplatesHolyShield.js'
import runeTemplatesFirefly from './runeTemplatesFirefly.js'
import runeTemplatesJsxGraph from './runeTemplatesJsxGraph.js'
import runeTemplatesElInput from './runeTemplatesElInput.js'
import runeTemplatesElSelect from './runeTemplatesElSelect.js'
import runeTemplatesElDatePicker from './runeTemplatesElDatePicker.js'
import runeTemplatesResumeBasicInfo from './runeTemplatesResumeBasicInfo.js'
import runeTemplatesResumeTitle from './runeTemplatesResumeTitle.js'
import runeTemplatesResumeExperience from './runeTemplatesResumeExperience.js'
import runeTemplatesResumeText from './runeTemplatesResumeText.js'
import runeTemplatesResumeSkill from './runeTemplatesResumeSkill.js'

// 保持原 API：14 个 create*Template() 函数
const createBlankTemplate = runeTemplatesBlank
const createInheritDemoTemplate = runeTemplatesInheritDemo
const createInputTemplate = runeTemplatesInput
const createHolyShieldTemplate = runeTemplatesHolyShield
const createFireflyTemplate = runeTemplatesFirefly
const createJsxGraphTemplate = runeTemplatesJsxGraph
const createElInputTemplate = runeTemplatesElInput
const createElSelectTemplate = runeTemplatesElSelect
const createElDatePickerTemplate = runeTemplatesElDatePicker
const createResumeBasicInfoTemplate = runeTemplatesResumeBasicInfo
const createResumeTitleTemplate = runeTemplatesResumeTitle
const createResumeExperienceTemplate = runeTemplatesResumeExperience
const createResumeTextTemplate = runeTemplatesResumeText
const createResumeSkillTemplate = runeTemplatesResumeSkill

export {
  createBlankTemplate,
  createInheritDemoTemplate,
  createInputTemplate,
  createHolyShieldTemplate,
  createFireflyTemplate,
  createJsxGraphTemplate,
  createElInputTemplate,
  createElSelectTemplate,
  createElDatePickerTemplate,
  createResumeBasicInfoTemplate,
  createResumeTitleTemplate,
  createResumeExperienceTemplate,
  createResumeTextTemplate,
  createResumeSkillTemplate
}

export default {
  createBlankTemplate,
  createInheritDemoTemplate,
  createInputTemplate,
  createHolyShieldTemplate,
  createFireflyTemplate,
  createJsxGraphTemplate,
  createElInputTemplate,
  createElSelectTemplate,
  createElDatePickerTemplate,
  createResumeBasicInfoTemplate,
  createResumeTitleTemplate,
  createResumeExperienceTemplate,
  createResumeTextTemplate,
  createResumeSkillTemplate
}
