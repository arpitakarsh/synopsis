import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import api from '../api/axios'

export default function UploadPage() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [vendorName, setVendorName] = useState('')
  const [contractTitle, setContractTitle] = useState('')
  const [contractValue, setContractValue] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('idle')
  const [error, setError] = useState('')

  const onDrop = useCallback((accepted) => {
    if (accepted.length > 0) {
      setFile(accepted[0])
      setError('')
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    onDropRejected: () => setError('Only PDF files under 10MB are accepted.'),
  })

  async function handleUpload() {
    if (!file) { setError('Please select a PDF file.'); return }
    if (!vendorName.trim()) { setError('Vendor name is required.'); return }
    if (!contractTitle.trim()) { setError('Contract title is required.'); return }

    setError('')
    setUploading(true)

    try {
      setProgress('signing')
      const sigRes = await api.get(`/contracts/presign?fileName=${encodeURIComponent(file.name)}`)
      const { signature, timestamp, publicId, cloudName, apiKey } = sigRes.data

      setProgress('uploading')
      const formData = new FormData()
      formData.append('file', file)
      formData.append('public_id', publicId)
      formData.append('timestamp', timestamp)
      formData.append('signature', signature)
      formData.append('api_key', apiKey)

      const cloudRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
        { method: 'POST', body: formData }
      )
      const cloudData = await cloudRes.json()

      if (!cloudData.public_id) throw new Error('Cloudinary upload failed')

      setProgress('analyzing')
      const analysisFileRef = cloudData.secure_url || cloudData.public_id
      const contractRes = await api.post('/contracts', {
        fileName: file.name,
        s3Key: analysisFileRef,
        vendorName: vendorName.trim(),
        contractTitle: contractTitle.trim(),
        contractValue: contractValue.trim() || null,
      })

      navigate(`/app/dashboard?id=${contractRes.data.id}`)
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Upload failed. Please try again.')
      setProgress('idle')
    } finally {
      setUploading(false)
    }
  }

  function removeFile() {
    setFile(null)
    setError('')
    setProgress('idle')
  }

  function formatFileSize(bytes) {
    if (!bytes) return '0 KB'
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  const progressSteps = [
    { key: 'signing', label: 'Preparing upload' },
    { key: 'uploading', label: 'Uploading file' },
    { key: 'analyzing', label: 'AI is analyzing...' },
  ]

  const currentStep = progressSteps.findIndex((s) => s.key === progress)

  return (
    <div className="space-y-6" style={{ animation: 'fadeIn 0.3s ease-out' }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-2xl font-bold text-gray-900">Upload Contract</h1>
            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full">AI</span>
          </div>
          <p className="text-sm text-gray-500">
            Upload a vendor PDF and generate a structured legal-risk report in under a minute.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-5">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          <div
            {...getRootProps()}
            className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition-all duration-200 overflow-hidden ${
              isDragActive
                ? 'border-blue-400 bg-blue-50'
                : file
                ? 'border-green-400 bg-green-50'
                : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
            }`}
          >
            <div className="absolute -top-14 -right-14 w-36 h-36 rounded-full bg-blue-100/50 blur-2xl pointer-events-none" />
            <input {...getInputProps()} />

            {file ? (
              <div className="relative z-10 flex flex-col items-center gap-3">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <polyline points="9 15 12 18 15 15"/>
                    <line x1="12" y1="11" x2="12" y2="18"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 break-all">{file.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatFileSize(file.size)} • PDF</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeFile() }}
                  className="text-xs text-red-500 hover:text-red-600 font-semibold transition-colors"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <div className="relative z-10 flex flex-col items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {isDragActive ? 'Drop your PDF here' : 'Drag and drop your contract PDF'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">or click to browse. PDF only, max 10MB.</p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Vendor Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Salesforce Inc."
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                className="w-full px-4 py-2.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all duration-150"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Contract Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. SaaS Master Agreement"
                value={contractTitle}
                onChange={(e) => setContractTitle(e.target.value)}
                className="w-full px-4 py-2.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all duration-150"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              Contract Value <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. $24,000/year"
              value={contractValue}
              onChange={(e) => setContractValue(e.target.value)}
              className="w-full px-4 py-2.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all duration-150"
            />
          </div>

          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {uploading && (
            <div className="space-y-3 pt-1">
              {progressSteps.map((step, i) => (
                <div key={step.key} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                    i < currentStep ? 'bg-green-500' : i === currentStep ? 'bg-blue-600' : 'bg-gray-100'
                  }`}>
                    {i < currentStep ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    ) : i === currentStep ? (
                      <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="white" strokeOpacity="0.3" strokeWidth="3"/>
                        <path d="M12 2a10 10 0 0110 10" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                      </svg>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-gray-300" />
                    )}
                  </div>
                  <span className={`text-sm transition-colors duration-200 ${
                    i === currentStep ? 'text-gray-900 font-medium' : i < currentStep ? 'text-gray-500' : 'text-gray-300'
                  }`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={uploading || !file}
            className={`w-full py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 ${
              uploading || !file
                ? 'bg-blue-300 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99]'
            }`}
          >
            {uploading ? 'Processing...' : 'Analyze Contract'}
          </button>
        </div>

        <aside className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">What Happens Next</p>
            <div className="space-y-3">
              {[
                'Signed upload URL is generated securely.',
                'PDF is uploaded to Cloudinary.',
                'AI extracts clauses and scores risk.',
                'Dashboard report is generated automatically.',
              ].map((item, idx) => (
                <div key={item} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-50 border border-blue-100 text-[11px] text-blue-700 font-bold flex items-center justify-center flex-shrink-0">
                    {idx + 1}
                  </span>
                  <p className="text-sm text-gray-600 leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-blue-100 mb-2">Upload Rules</p>
            <p className="text-sm text-blue-50 leading-relaxed">
              One file at a time. PDF only. Keep file size under 10MB for faster extraction and more reliable analysis.
            </p>
          </div>
        </aside>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
