import fs from 'fs'
import { buildTarkReportDocxBase64 } from './src/utils/tarkReportDocx.ts'

const request = {
  title: 'Test Report',
  sections: [],
  pathDiagramPngBase64: 'iVBORw0KGgoAAAANSU5EUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
}

buildTarkReportDocxBase64(request).then(base64 => {
  fs.writeFileSync('test-report.docx', Buffer.from(base64, 'base64'))
  console.log('Saved test-report.docx')
}).catch(console.error)
