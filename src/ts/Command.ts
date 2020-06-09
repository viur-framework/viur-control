const { spawn } = require('child_process')

export class Command {
  static run(cmd: string, options: string[] = []) {
    return new Promise((resolve, reject) => {
      const command = spawn(cmd, options)
      let result = ''

      command.stderr.on('data', (error: string) => reject(error))
      command.stdout.on('data', (data: any) => result += data.toString())
      command.on('close', () => resolve(result))
    })
  }
}

module.exports = Command
