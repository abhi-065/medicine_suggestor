import { useMemo, useState, useEffect } from 'react'
import { Navigate, NavLink, Route, Routes, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { 
  Camera, Upload, Sparkles, MapPin, Search, Activity, 
  ChevronRight, AlertTriangle, ShieldCheck, Pill, Copy, Check, MessageSquare, Plus, X, ArrowRight, ActivitySquare, BadgeAlert, ExternalLink
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || (window.location.origin === 'http://localhost:5173' ? 'http://localhost:8000/api' : '/api')

const parseMedicineText = (input) =>
  input
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)

const formatCurrency = (value) => `₹${Number(value || 0).toFixed(2)}`

const getErrorMessage = async (response) => {
  const fallback = `Request failed with status ${response.status}`
  try {
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return fallback
    }
    const payload = await response.json()
    return payload?.detail || fallback
  } catch {
    return fallback
  }
}

const pageVariants = {
  initial: { opacity: 0, y: 30, filter: "blur(10px)" },
  in: { opacity: 1, y: 0, filter: "blur(0px)" },
  out: { opacity: 0, y: -30, filter: "blur(10px)" }
}

const pageTransition = { type: 'spring', stiffness: 200, damping: 20 }

export default function App() {
  const [textInput, setTextInput] = useState('')
  const [editableMedicines, setEditableMedicines] = useState([])
  const [newMedicine, setNewMedicine] = useState('')
  const [mappings, setMappings] = useState([])
  const [alternatives, setAlternatives] = useState([])
  const [nearbyStores, setNearbyStores] = useState([])
  const [selectedMedicine, setSelectedMedicine] = useState('')
  const [error, setError] = useState('')
  const [loadingOCR, setLoadingOCR] = useState(false)
  const [loadingAnalyze, setLoadingAnalyze] = useState(false)
  const [loadingNearby, setLoadingNearby] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [sendingChat, setSendingChat] = useState(false)
  const [summaryCopied, setSummaryCopied] = useState(false)
  const [checklist, setChecklist] = useState({
    dosage: false,
    interaction: false,
    doctor: false,
  })
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      content:
        'Welcome to MediGuide Assistant. Ask me about safety, usage, or switching alternatives.',
    },
  ])

  const bestOption = alternatives[0]
  const otherOptions = alternatives.slice(1, 7)
  const medicineCount =
    mappings.length || editableMedicines.length || parseMedicineText(textInput).length

  const savingsStats = useMemo(() => {
    if (!alternatives.length) {
      return { highest: 0, lowest: 0, total: 0, monthly: 0 }
    }
    const prices = alternatives.map((item) => Number(item.approx_price))
    const lowest = Math.min(...prices)
    const highest = Math.max(...prices)
    const total = Math.max(0, highest - lowest)
    return {
      highest,
      lowest,
      total,
      monthly: total * 2,
    }
  }, [alternatives])

  const summaryText = useMemo(() => {
    if (!bestOption) {
      return 'No results yet. Analyze medicines first.'
    }
    const lines = [
      'MedIntel Quick+ Summary',
      `Medicines analyzed: ${medicineCount}`,
      `Best savings option: ${bestOption.name} (${formatCurrency(bestOption.approx_price)})`,
      `Estimated savings: ${formatCurrency(savingsStats.total)}`,
    ]
    if (mappings.length) {
      lines.push('')
      lines.push('Generic mappings:')
      mappings.forEach((item) => lines.push(`- ${item.input} -> ${item.generic}`))
    }
    return lines.join('\n')
  }, [bestOption, medicineCount, savingsStats.total, mappings])

  const updateMedicine = (index, value) => {
    setEditableMedicines((current) =>
      current.map((medicine, idx) => (idx === index ? value : medicine)),
    )
  }

  const removeMedicine = (index) => {
    setEditableMedicines((current) => current.filter((_, idx) => idx !== index))
  }

  const addMedicine = () => {
    const cleaned = newMedicine.trim()
    if (!cleaned) {
      return
    }
    setEditableMedicines((current) => [...current, cleaned])
    setNewMedicine('')
  }

  const handleUpload = async (file) => {
    if (!file) {
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    setLoadingOCR(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE}/ocr`, {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        setError(await getErrorMessage(response))
        return
      }
      const payload = await response.json()
      setEditableMedicines(payload.medicines || [])
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Failed to connect to backend.'
      setError(message)
    } finally {
      setLoadingOCR(false)
    }
  }

  const handleAnalyze = async () => {
    const typedMedicines = parseMedicineText(textInput)
    const preparedList = editableMedicines.map((item) => item.trim()).filter(Boolean)
    const medicines = preparedList.length ? preparedList : typedMedicines

    if (medicines.length === 0) {
      setError('Please enter at least one medicine or upload a prescription image.')
      return false
    }

    setLoadingAnalyze(true)
    setError('')
    setNearbyStores([])
    setSummaryCopied(false)

    try {
      const analyzeResponse = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medicines }),
      })
      if (!analyzeResponse.ok) {
        setError(await getErrorMessage(analyzeResponse))
        return false
      }
      const analyzePayload = await analyzeResponse.json()
      setMappings(analyzePayload.mappings || [])

      const alternativesResponse = await fetch(`${API_BASE}/alternatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: analyzePayload.mappings || [] }),
      })
      if (!alternativesResponse.ok) {
        setError(await getErrorMessage(alternativesResponse))
        return false
      }
      const alternativesPayload = await alternativesResponse.json()
      const fetchedAlternatives = alternativesPayload.alternatives || []
      setAlternatives(fetchedAlternatives)
      setSelectedMedicine(
        fetchedAlternatives[0]?.name || analyzePayload.mappings?.[0]?.input || '',
      )
      return true
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Failed to connect to backend.'
      setError(message)
      return false
    } finally {
      setLoadingAnalyze(false)
    }
  }

  const handleFindNearby = async () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported in this browser.')
      return
    }

    setLoadingNearby(true)
    setError('')
    try {
      const location = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        })
      })

      const { latitude, longitude } = location.coords
      const nearbyResponse = await fetch(`${API_BASE}/nearby?lat=${latitude}&lng=${longitude}`)
      if (!nearbyResponse.ok) {
        setError(await getErrorMessage(nearbyResponse))
        return
      }

      const payload = await nearbyResponse.json()
      setNearbyStores(payload.stores || [])
    } catch {
      setError('Unable to fetch your location. Please enable location access.')
    } finally {
      setLoadingNearby(false)
    }
  }

  const handleChatSubmit = async (event) => {
    event.preventDefault()
    const question = chatInput.trim()
    if (!question) {
      return
    }

    setChatInput('')
    setSendingChat(true)
    setChatMessages((current) => [...current, { role: 'user', content: question }])

    try {
      const historyPayload = chatMessages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(1) // skip the initial greeting

      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          selected_medicine: selectedMedicine || null,
          mappings,
          history: historyPayload
        }),
      })
      if (!response.ok) {
        setError(await getErrorMessage(response))
        return
      }
      const payload = await response.json()
      setChatMessages((current) => [...current, { role: 'assistant', content: payload.answer }])
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Failed to connect to backend.'
      setError(message)
    } finally {
      setSendingChat(false)
    }
  }

  const copySummary = async () => {
    if (!navigator.clipboard) {
      setError('Clipboard access is not available in this browser.')
      return
    }
    await navigator.clipboard.writeText(summaryText)
    setSummaryCopied(true)
    setTimeout(() => setSummaryCopied(false), 1800)
  }

  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<WelcomePage />} />
        <Route
          path="/analyze"
          element={
            <WorkspaceLayout error={error} clearError={() => setError('')}>
              <AnalyzePage
                textInput={textInput}
                setTextInput={setTextInput}
                loadingOCR={loadingOCR}
                loadingAnalyze={loadingAnalyze}
                editableMedicines={editableMedicines}
                updateMedicine={updateMedicine}
                removeMedicine={removeMedicine}
                newMedicine={newMedicine}
                setNewMedicine={setNewMedicine}
                addMedicine={addMedicine}
                onUpload={handleUpload}
                onAnalyze={handleAnalyze}
              />
            </WorkspaceLayout>
          }
        />
        <Route
          path="/results"
          element={
            <WorkspaceLayout error={error} clearError={() => setError('')}>
              <ResultsPage
                bestOption={bestOption}
                otherOptions={otherOptions}
                alternatives={alternatives}
                mappings={mappings}
                savingsStats={savingsStats}
                nearbyStores={nearbyStores}
                loadingNearby={loadingNearby}
                onFindNearby={handleFindNearby}
                onCopySummary={copySummary}
                summaryCopied={summaryCopied}
              />
            </WorkspaceLayout>
          }
        />
        <Route
          path="/mediguide"
          element={
            <WorkspaceLayout error={error} clearError={() => setError('')}>
              <MediGuidePage
                chatInput={chatInput}
                setChatInput={setChatInput}
                sendingChat={sendingChat}
                onSubmit={handleChatSubmit}
                chatMessages={chatMessages}
                checklist={checklist}
                setChecklist={setChecklist}
              />
            </WorkspaceLayout>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

function WelcomePage() {
  const navigate = useNavigate()

  return (
    <motion.div 
      initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}
      className="relative min-h-screen overflow-hidden bg-slate-950 text-white flex flex-col justify-center"
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[40%] -left-[10%] w-[70%] h-[70%] rounded-full bg-emerald-500/10 blur-[120px] animate-pulse-glow" />
        <div className="absolute top-[20%] -right-[20%] w-[60%] h-[60%] rounded-full bg-cyan-500/10 blur-[120px] animate-pulse-glow" style={{ animationDelay: '2s' }} />
        <div className="absolute -bottom-[20%] left-[20%] w-[50%] h-[50%] rounded-full bg-teal-500/10 blur-[100px] animate-pulse-glow" style={{ animationDelay: '4s' }} />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-12 md:px-12 flex flex-col justify-center items-start">
        <motion.div 
          initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2 }}
          className="glass-panel rounded-3xl p-8 md:p-14 max-w-4xl"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-bold text-emerald-300 uppercase tracking-widest shadow-[0_0_15px_rgba(16,185,129,0.2)] mb-6">
            <Sparkles className="w-4 h-4" /> Hackathon Winning Build
          </div>
          <h1 className="text-5xl md:text-7xl font-black leading-tight text-white mb-6">
            MedIntel <span className="text-gradient text-glow">Quick+</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-300 leading-relaxed max-w-2xl font-light mb-10">
            A premium medicine intelligence platform powered by <span className="font-semibold text-emerald-300">Gemini AI</span>. Decode prescriptions via OCR, find affordable alternatives instantly, and locate nearby pharmacies with intelligent mapping.
          </p>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <FeatureCard 
              icon={<Camera className="w-6 h-6 text-emerald-400" />}
              title="Prescription OCR"
              description="Upload doctor prescriptions directly. On-device extraction gives you full control."
              delay={0.4}
            />
            <FeatureCard 
              icon={<Activity className="w-6 h-6 text-cyan-400" />}
              title="AI Alternatives"
              description="Gemini powers the generic mapping to find you the absolute cheapest alternatives."
              delay={0.5}
            />
            <FeatureCard 
              icon={<MessageSquare className="w-6 h-6 text-teal-400" />}
              title="MediGuide"
              description="A dedicated assistant to ensure safety, dosage accuracy, and interaction checks."
              delay={0.6}
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <motion.button
              whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(16,185,129,0.4)" }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/analyze')}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 px-8 py-4 text-base font-bold text-slate-950 shadow-xl transition-all"
            >
              Start Analyzing <ArrowRight className="w-5 h-5" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.1)" }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/mediguide')}
              className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-8 py-4 text-base font-bold text-white transition-all backdrop-blur-md"
            >
              Open MediGuide
            </motion.button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

function FeatureCard({ icon, title, description, delay }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="glass-card p-6 flex flex-col gap-3 group cursor-default"
    >
      <div className="w-12 h-12 rounded-xl bg-slate-800/50 border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-white tracking-wide">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
    </motion.div>
  )
}

function WorkspaceLayout({ children, error, clearError }) {
  const navClass = ({ isActive }) =>
    `flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-300 ${
      isActive
        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
        : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
    }`

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden flex flex-col">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-cyan-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8 flex-1 flex flex-col">
        <header className="glass-panel rounded-2xl p-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <ActivitySquare className="w-6 h-6 text-slate-950" />
              </div>
              <div>
                <h1 className="text-xl font-black text-white tracking-wide flex items-center gap-2">
                  MedIntel <span className="text-emerald-400 text-glow">Quick+</span>
                </h1>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mt-0.5">
                  Powered by Gemini
                </p>
              </div>
            </div>
            <NavLink to="/" className="text-sm font-semibold text-slate-400 hover:text-white transition-colors border border-white/10 rounded-lg px-3 py-1.5 hover:bg-white/5">
              Exit Workspace
            </NavLink>
          </div>
          <nav className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
            <NavLink to="/analyze" className={navClass}>
              <Search className="w-4 h-4" /> Analyze
            </NavLink>
            <NavLink to="/results" className={navClass}>
              <Activity className="w-4 h-4" /> Results
            </NavLink>
            <NavLink to="/mediguide" className={navClass}>
              <MessageSquare className="w-4 h-4" /> MediGuide
            </NavLink>
          </nav>
        </header>

        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 24 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-start justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <BadgeAlert className="w-5 h-5 text-red-400 shrink-0" />
                  <p>{error}</p>
                </div>
                <button
                  type="button"
                  onClick={clearError}
                  className="rounded-lg p-1 hover:bg-red-500/20 transition-colors"
                >
                  <X className="w-4 h-4 text-red-300" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="mt-6 flex-1 flex flex-col relative">
          {children}
        </main>
      </div>
    </div>
  )
}

function AnalyzePage({
  textInput,
  setTextInput,
  loadingOCR,
  loadingAnalyze,
  editableMedicines,
  updateMedicine,
  removeMedicine,
  newMedicine,
  setNewMedicine,
  addMedicine,
  onUpload,
  onAnalyze,
}) {
  const navigate = useNavigate()

  const analyzeAndNavigate = async () => {
    const ok = await onAnalyze()
    if (ok) {
      navigate('/results')
    }
  }

  return (
    <motion.section 
      initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}
      className="glass-panel rounded-3xl p-6 md:p-8 flex-1 flex flex-col"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">
          1
        </div>
        <h2 className="text-2xl font-black text-white tracking-wide">Input Medicines</h2>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 flex-1">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <label className="text-sm font-semibold text-slate-300 ml-1">Type Medicine Names</label>
            <textarea
              value={textInput}
              onChange={(event) => setTextInput(event.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 resize-none shadow-inner"
              placeholder="e.g., Paracetamol 500mg&#10;Amoxicillin"
            />
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-slate-900 px-3 text-xs font-semibold text-slate-500 uppercase tracking-widest">Or Use Image</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-sm font-semibold text-slate-300 ml-1">Upload Prescription</label>
            <label className="cursor-pointer group">
              <div className="w-full rounded-2xl border-2 border-dashed border-white/10 bg-slate-900/30 p-8 flex flex-col items-center justify-center gap-3 transition-all hover:border-emerald-500/50 hover:bg-slate-900/50">
                <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                  {loadingOCR ? <Loader className="text-emerald-400" /> : <Upload className="w-6 h-6 text-slate-400 group-hover:text-emerald-400 transition-colors" />}
                </div>
                <p className="text-sm font-semibold text-slate-300">
                  {loadingOCR ? 'Extracting via OCR...' : 'Click to browse or drag image'}
                </p>
                <p className="text-xs text-slate-500">Supports JPG, PNG formats</p>
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => onUpload(event.target.files?.[0])}
                disabled={loadingOCR}
              />
            </label>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Extracted & Editable Items</h3>
            <span className="px-2 py-0.5 rounded-md bg-white/5 text-xs font-semibold text-slate-400 border border-white/10">
              {editableMedicines.length} items
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 min-h-[200px]">
            <AnimatePresence>
              {editableMedicines.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
                  <Pill className="w-8 h-8 opacity-20" />
                  No OCR items yet.
                </motion.div>
              ) : (
                editableMedicines.map((medicine, index) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                    key={`${medicine}-${index}`} 
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={medicine}
                      onChange={(event) => updateMedicine(index, event.target.value)}
                      className="flex-1 rounded-xl border border-white/10 bg-slate-900/80 px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50 focus:bg-slate-900 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => removeMedicine(index)}
                      className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 hover:text-red-300 transition-all shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>

          <div className="mt-4 pt-4 border-t border-white/10 flex gap-2">
            <input
              type="text"
              value={newMedicine}
              onChange={(event) => setNewMedicine(event.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMedicine()}
              className="flex-1 rounded-xl border border-white/10 bg-slate-900/50 px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50 placeholder-slate-600"
              placeholder="Add item manually..."
            />
            <button
              type="button"
              onClick={addMedicine}
              className="px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white font-semibold hover:bg-white/20 transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={analyzeAndNavigate}
          disabled={loadingAnalyze}
          className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-8 py-4 text-base font-bold text-slate-950 shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
        >
          {loadingAnalyze ? (
            <><Loader className="text-slate-950" /> Asking Gemini...</>
          ) : (
            <><Sparkles className="w-5 h-5" /> Find Alternatives</>
          )}
        </motion.button>
      </div>
    </motion.section>
  )
}

function ResultsPage({
  bestOption,
  otherOptions,
  alternatives,
  mappings,
  savingsStats,
  nearbyStores,
  loadingNearby,
  onFindNearby,
  onCopySummary,
  summaryCopied,
}) {
  const navigate = useNavigate()

  if (!bestOption) {
    return (
      <motion.section 
        initial="initial" animate="in" exit="out" variants={pageVariants}
        className="glass-panel rounded-3xl p-12 text-center flex flex-col items-center justify-center flex-1"
      >
        <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center mb-6">
          <Search className="w-8 h-8 text-slate-500" />
        </div>
        <h2 className="text-2xl font-black text-white mb-2">No Analysis Data</h2>
        <p className="text-slate-400 mb-8 max-w-md">
          Start by adding medicines in the Analyze tab. Gemini will then process them and find the best alternatives.
        </p>
        <button
          onClick={() => navigate('/analyze')}
          className="px-6 py-3 rounded-xl bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
        >
          Go to Analyze
        </button>
      </motion.section>
    )
  }

  return (
    <motion.div 
      initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}
      className="space-y-6"
    >
      <section className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-900/40 via-slate-900 to-slate-900 p-8 shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px]" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">Gemini's Top Pick</p>
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-8">{bestOption.name}</h2>
          
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            <MetricCard label="Lowest Price" value={formatCurrency(bestOption.approx_price)} highlight />
            <MetricCard label="Potential Saving" value={formatCurrency(savingsStats.total)} />
            <MetricCard label="Monthly Estimate" value={formatCurrency(savingsStats.monthly)} />
            <MetricCard label="Total Alternatives" value={String(alternatives.length)} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {Object.entries(bestOption.buy_online_links || {}).map(([store, link]) => (
              <a 
                key={store} href={link} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white border border-white/10 hover:bg-white/20 transition-all"
              >
                Buy on {store} <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ))}
            <div className="w-px h-8 bg-white/10 mx-2 hidden md:block" />
            <button
              onClick={onCopySummary}
              className="flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-bold text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white transition-all"
            >
              {summaryCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {summaryCopied ? 'Copied!' : 'Copy Summary'}
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_350px]">
        <div className="space-y-6">
          <section className="glass-panel rounded-3xl p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Pill className="w-5 h-5 text-cyan-400" /> Other Alternatives
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {otherOptions.map((option, idx) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}
                  key={`${option.generic}-${option.name}`}
                  className="glass-card p-4 flex flex-col justify-between group"
                >
                  <div>
                    <p className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">{option.name}</p>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-1">{option.generic}</p>
                    {option.uses && <p className="text-xs text-emerald-300 mt-2 line-clamp-2" title={option.uses}><span className="font-semibold text-emerald-400">Uses:</span> {option.uses}</p>}
                    {option.differences && <p className="text-xs text-amber-200/80 mt-1 line-clamp-2" title={option.differences}><span className="font-semibold text-amber-300">Diff:</span> {option.differences}</p>}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-lg font-black text-emerald-400">{formatCurrency(option.approx_price)}</p>
                    <div className="flex gap-1">
                      {Object.keys(option.buy_online_links || {}).slice(0,2).map(store => (
                        <a key={store} href={option.buy_online_links[store]} target="_blank" rel="noreferrer" className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/20 transition-colors" title={`Buy on ${store}`}>
                          <ExternalLink className="w-3 h-3 text-slate-300" />
                        </a>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          <section className="glass-panel rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-teal-400" /> Nearby Pharmacies
              </h3>
              <button
                onClick={onFindNearby}
                disabled={loadingNearby}
                className="flex items-center gap-2 rounded-xl bg-teal-500/20 px-4 py-2 text-sm font-bold text-teal-300 hover:bg-teal-500/30 transition-colors border border-teal-500/30 disabled:opacity-50"
              >
                {loadingNearby ? <Loader className="text-teal-400" /> : <Search className="w-4 h-4" />}
                {loadingNearby ? 'Locating...' : 'Find Nearby'}
              </button>
            </div>

            {nearbyStores.length === 0 ? (
              <div className="h-32 flex flex-col items-center justify-center text-slate-500 text-sm border border-dashed border-white/10 rounded-2xl bg-white/5">
                <MapPin className="w-6 h-6 mb-2 opacity-50" />
                Click 'Find Nearby' to search area
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {nearbyStores.map((store, idx) => (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.1 }}
                    key={`${store.name}-${store.map_link}`}
                    className="glass-card p-4"
                  >
                    <p className="text-sm font-bold text-white mb-1">{store.name}</p>
                    <p className="text-xs font-semibold text-teal-400 mb-2">{Number(store.distance_km).toFixed(2)} km away</p>
                    {store.address && <p className="text-xs text-slate-400 mb-3 line-clamp-2">{store.address}</p>}
                    <a
                      href={store.map_link} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition-colors"
                    >
                      <MapPin className="w-3 h-3" /> Open Maps
                    </a>
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="glass-panel rounded-3xl p-6 h-fit sticky top-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <ActivitySquare className="w-5 h-5 text-emerald-400" /> Generic Mappings
          </h3>
          <div className="space-y-3">
            {mappings.map((item, idx) => (
              <motion.div
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.1 }}
                key={`${item.input}-${item.generic}`}
                className="p-3 rounded-xl bg-slate-800/50 border border-white/5"
              >
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Original</p>
                <p className="text-sm font-bold text-white mb-2">{item.input}</p>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Generic Extracted</p>
                <p className="text-sm text-emerald-300 font-medium">{item.generic}</p>
              </motion.div>
            ))}
          </div>
        </section>
      </div>
    </motion.div>
  )
}

function MetricCard({ label, value, highlight }) {
  return (
    <div className={`rounded-2xl p-4 border ${highlight ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-800/50 border-white/5'}`}>
      <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${highlight ? 'text-emerald-400' : 'text-slate-400'}`}>{label}</p>
      <p className={`text-2xl font-black ${highlight ? 'text-emerald-400 text-glow' : 'text-white'}`}>{value}</p>
    </div>
  )
}

function MediGuidePage({
  chatInput,
  setChatInput,
  sendingChat,
  onSubmit,
  chatMessages,
  checklist,
  setChecklist,
}) {
  const quickPrompts = [
    'Is this alternative safe for daily use?',
    'What is this medicine usually used for?',
    'Can I switch from brand to generic directly?',
  ]

  return (
    <motion.div 
      initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition}
      className="grid gap-6 xl:grid-cols-[1fr_340px] flex-1 min-h-[600px]"
    >
      <section className="glass-panel rounded-3xl p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white">MediGuide AI</h2>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Powered by Gemini</p>
          </div>
        </div>
        <p className="text-sm text-slate-400 mb-6 mt-2 ml-1">Ask safety, dosage, and usage questions contextually based on your analysis.</p>

        <div className="flex flex-wrap gap-2 mb-4">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setChatInput(prompt)}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-4 mb-4 min-h-[300px]">
          {chatMessages.map((message, index) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              key={`${message.role}-${index}`}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-relaxed shadow-lg overflow-hidden ${
                message.role === 'user'
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-br-none'
                  : 'bg-slate-800 border border-white/10 text-slate-200 rounded-bl-none prose prose-invert prose-sm prose-emerald max-w-none'
              }`}>
                {message.role === 'assistant' ? (
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                ) : (
                  message.content
                )}
              </div>
            </motion.div>
          ))}
          {sendingChat && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
              <div className="bg-slate-800 border border-white/10 rounded-2xl rounded-bl-none px-5 py-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" />
                <div className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
            </motion.div>
          )}
        </div>

        <form className="relative flex items-center" onSubmit={onSubmit}>
          <input
            type="text"
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-900/80 pl-5 pr-16 py-4 text-sm text-white outline-none focus:border-teal-500/50 focus:bg-slate-900 transition-all shadow-inner"
            placeholder="Type your medicine question here..."
          />
          <button
            type="submit"
            disabled={sendingChat || !chatInput.trim()}
            className="absolute right-2 w-10 h-10 rounded-xl bg-teal-500 flex items-center justify-center text-slate-950 hover:bg-teal-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sendingChat ? <Loader className="w-4 h-4 text-slate-950" /> : <ChevronRight className="w-5 h-5 font-black" />}
          </button>
        </form>
      </section>

      <aside className="glass-panel rounded-3xl p-6 h-fit">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <h3 className="text-lg font-black text-white">Safety Checklist</h3>
        </div>
        <p className="text-xs text-slate-400 mb-6">Confirm these steps before making a final medicine purchase.</p>
        
        <div className="space-y-3">
          {[
            { id: 'dosage', label: 'Verify dosage matches exactly' },
            { id: 'interaction', label: 'Check for drug interactions' },
            { id: 'doctor', label: 'Consulted doctor for approval' },
          ].map((item) => (
            <label key={item.id} className="flex items-start gap-3 p-3 rounded-xl border border-white/5 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
              <input
                type="checkbox"
                checked={checklist[item.id]}
                onChange={(e) => setChecklist({ ...checklist, [item.id]: e.target.checked })}
                className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900 accent-emerald-500"
              />
              <span className={`text-sm ${checklist[item.id] ? 'text-slate-400 line-through' : 'text-slate-200'} transition-all`}>
                {item.label}
              </span>
            </label>
          ))}
        </div>
      </aside>
    </motion.div>
  )
}

function Loader({ className }) {
  return <div className={`animate-spin w-4 h-4 rounded-full border-2 border-current border-t-transparent ${className}`} />
}
