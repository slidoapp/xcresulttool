import * as core from '@actions/core'
import * as exec from '@actions/exec'

export class XCCov {
  constructor(private bundlePath: string) {}

  async viewJSONReport(): Promise<string> {
    const args = ['xccov', 'view', '--report', '--json', this.bundlePath]

    let output = ''
    const options = {
      silent: !core.isDebug(),
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString()
        }
      }
    }

    await exec.exec('xcrun', args, options)
    return output
  }
}
