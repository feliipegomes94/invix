const { exec } = require('child_process');
const fs = require('fs').promises;

async function transcribeAudio(audioPath) {
  return new Promise((resolve, reject) => {
    exec(`python3 -c "import whisper; model = whisper.load_model('small'); result = model.transcribe('${audioPath}', language='pt'); print(result['text'])"`, (error, stdout, stderr) => {
      if (error || stderr) {
        reject(error || stderr);
      } else {
        resolve(stdout.trim());
      }
      fs.unlink(audioPath).catch(() => {}); // Remove áudio após uso
    });
  });
}

module.exports = { transcribeAudio };