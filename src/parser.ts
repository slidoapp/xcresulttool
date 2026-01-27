/*eslint-disable @typescript-eslint/no-explicit-any */

import {TestResults_Tests} from '../dev/@types/TestResults_Tests'
import {XCCov} from './xctools/xccov'
import {XCResultTool} from './xctools/xcresulttool'

export class Parser {
  private bundlePath: string

  constructor(bundlePath: string) {
    this.bundlePath = bundlePath
  }

  async parseLegacy(reference?: string): Promise<any> {
    const tool = new XCResultTool(this.bundlePath)
    const root = JSON.parse(await tool.getLegacyJSON(reference))
    return parseObject(root) as any
  }

  async parseModernTests(): Promise<TestResults_Tests> {
    const tool = new XCResultTool(this.bundlePath)
    const output = await tool.getTestResults_Tests()
    return JSON.parse(output)
  }

  async exportCodeCoverage(): Promise<string> {
    const tool = new XCCov(this.bundlePath)
    return await tool.viewJSONReport()
  }
}

function parseObject(element: object): object {
  const obj: any = {}

  for (const [key, value] of Object.entries(element)) {
    if (value['_value']) {
      obj[key] = parsePrimitive(value)
    } else if (value['_values']) {
      obj[key] = parseArray(value)
    } else if (key === '_type') {
      continue
    } else {
      obj[key] = parseObject(value)
    }
  }

  return obj
}

function parseArray(arrayElement: any): any {
  return arrayElement['_values'].map((arrayValue: object) => {
    const obj: any = {}
    for (const [key, value] of Object.entries(arrayValue)) {
      if (value['_value']) {
        obj[key] = parsePrimitive(value)
      } else if (value['_values']) {
        obj[key] = parseArray(value)
      } else if (key === '_type') {
        continue
      } else if (key === '_value') {
        continue
      } else {
        obj[key] = parseObject(value)
      }
    }
    return obj
  })
}

function parsePrimitive(element: any): any {
  switch (element['_type']['_name']) {
    case 'Int':
      return parseInt(element['_value'])
    case 'Double':
      return parseFloat(element['_value'])
    default:
      return element['_value']
  }
}
