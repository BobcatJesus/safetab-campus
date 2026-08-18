import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'

const url = 'https://safetabbobcat.app/'
const outputDirectory = new URL('../public/', import.meta.url)
const outputFile = new URL('safetab-qr.svg', outputDirectory)

await mkdir(outputDirectory, { recursive: true })
await QRCode.toFile(fileURLToPath(outputFile), url, {
  type: 'svg',
  errorCorrectionLevel: 'H',
  margin: 2,
  width: 1200,
})

await writeFile(
  new URL('safetab-qr-url.txt', outputDirectory),
  `${url}\n`,
)

console.log(`Generated ${outputFile.pathname} for ${url}`)