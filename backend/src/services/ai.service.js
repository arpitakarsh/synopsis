async function analyzeContract(contractId, s3Key) {
  console.log(`AI analysis triggered for contract: ${contractId}`)
  console.log(`S3 Key: ${s3Key}`)
}

module.exports = { analyzeContract }