import { useMemo, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const parseMedicineText = (input) =>
  input
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)

const formatCurrency = (value) => `₹${Number(value || 0).toFixed(2)}`

const getErrorMessage = async (response) => {
  const fallback = `Request failed with status ${response.status}`
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    return fallback
  }
  const payload = await response.json()
  return payload?.detail || fallback
}

const loadingSpinner = (
  <span
    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
    aria-hidden="true"
  />
)

function App() {
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
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          selected_medicine: selectedMedicine || null,
          mappings,
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

  return (
    <Routes>
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
  )
}

function WelcomePage() {
  const navigate = useNavigate()

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="animate-gradient-flow absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(20,184,166,0.35),_transparent_40%),radial-gradient(circle_at_20%_80%,_rgba(45,212,191,0.25),_transparent_45%),radial-gradient(circle_at_80%_80%,_rgba(56,189,248,0.25),_transparent_40%)]" />
      <div className="animate-float-slow absolute -left-16 top-10 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="animate-float-fast absolute right-0 top-28 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="animate-float-slow absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-teal-300/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4 py-10 md:px-8">
        <div className="animate-slide-up rounded-3xl border border-white/20 bg-white/10 p-8 backdrop-blur-xl md:p-12">
          <p className="inline-flex rounded-full border border-emerald-300/40 bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-100">
            Hackathon Build • Multi-Page Experience
          </p>
          <h1 className="mt-4 text-4xl font-black leading-tight md:text-6xl">
            MedIntel Quick+
          </h1>
          <p className="mt-4 max-w-3xl text-sm text-slate-200 md:text-lg">
            A modern medicine intelligence app to decode prescriptions, find affordable
            alternatives, compare online options, and discover nearby pharmacies instantly.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <FeatureCard
              title="Prescription OCR"
              description="Upload doctor prescriptions and extract medicine names with editable control."
            />
            <FeatureCard
              title="Savings Intelligence"
              description="Compare alternatives sorted by lowest price with rich comparison views."
            />
            <FeatureCard
              title="MediGuide Assistant"
              description="Ask contextual medicine questions with smart safety-first guidance."
            />
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/analyze')}
              className="group rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-3 text-sm font-bold text-white shadow-xl shadow-emerald-500/20 transition hover:scale-[1.02]"
            >
              Start Analyzing
              <span className="ml-2 inline-block transition-transform group-hover:translate-x-1">
                →
              </span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/mediguide')}
              className="rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/20"
            >
              Open MediGuide
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function WorkspaceLayout({ children, error, clearError }) {
  const navClass = ({ isActive }) =>
    `rounded-xl px-4 py-2 text-sm font-semibold transition ${
      isActive
        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
        : 'text-slate-600 hover:bg-slate-100'
    }`

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-cyan-100">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
        <header className="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">
                MedIntel Quick+
              </p>
              <h1 className="text-xl font-black text-slate-900 md:text-2xl">
                Advanced Medicine Intelligence Suite
              </h1>
            </div>
            <NavLink to="/" className="text-sm font-semibold text-slate-500 hover:text-slate-800">
              Back to Welcome
            </NavLink>
          </div>
          <nav className="mt-4 flex flex-wrap gap-2">
            <NavLink to="/analyze" className={navClass}>
              Analyze
            </NavLink>
            <NavLink to="/results" className={navClass}>
              Results
            </NavLink>
            <NavLink to="/mediguide" className={navClass}>
              MediGuide Assistant
            </NavLink>
          </nav>
        </header>

        {error && (
          <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p>{error}</p>
            <button
              type="button"
              onClick={clearError}
              className="rounded-md border border-red-300 px-2 py-1 text-xs font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        <main className="mt-6">{children}</main>
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
    <section className="animate-slide-up rounded-3xl border border-white/70 bg-white/85 p-6 shadow-xl backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-black text-slate-900">Prescription Analyzer</h2>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
          Step 1 of 3
        </span>
      </div>

      <textarea
        value={textInput}
        onChange={(event) => setTextInput(event.target.value)}
        rows={4}
        className="mt-5 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
        placeholder="Enter medicine (e.g., Crocin 650)"
      />

      <div className="mt-4 flex flex-wrap gap-3">
        <label className="cursor-pointer rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-bold text-white shadow-lg transition hover:brightness-110">
          {loadingOCR ? (
            <span className="inline-flex items-center gap-2">
              {loadingSpinner}
              Extracting...
            </span>
          ) : (
            'Upload Prescription'
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => onUpload(event.target.files?.[0])}
            disabled={loadingOCR}
          />
        </label>
        <button
          type="button"
          onClick={analyzeAndNavigate}
          disabled={loadingAnalyze}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {loadingAnalyze ? (
            <span className="inline-flex items-center gap-2">
              {loadingSpinner}
              Analyzing...
            </span>
          ) : (
            'Find Cheaper Alternatives'
          )}
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-bold text-slate-900">Editable OCR Medicines</h3>
        <div className="mt-3 space-y-2">
          {editableMedicines.length === 0 ? (
            <p className="text-sm text-slate-500">OCR results will appear here after upload.</p>
          ) : (
            editableMedicines.map((medicine, index) => (
              <div key={`${medicine}-${index}`} className="flex gap-2">
                <input
                  type="text"
                  value={medicine}
                  onChange={(event) => updateMedicine(index, event.target.value)}
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => removeMedicine(index)}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newMedicine}
            onChange={(event) => setNewMedicine(event.target.value)}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            placeholder="Add medicine manually"
          />
          <button
            type="button"
            onClick={addMedicine}
            className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"
          >
            Add
          </button>
        </div>
      </div>
    </section>
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
      <section className="rounded-3xl border border-white/70 bg-white/85 p-8 text-center shadow-xl backdrop-blur">
        <h2 className="text-2xl font-black text-slate-900">No analysis yet</h2>
        <p className="mt-2 text-sm text-slate-600">
          Start by adding medicines and running analysis to unlock this page.
        </p>
        <button
          type="button"
          onClick={() => navigate('/analyze')}
          className="mt-5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700"
        >
          Go to Analyze
        </button>
      </section>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 p-6 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
          Best Savings Option
        </p>
        <h2 className="mt-2 text-3xl font-black text-slate-900">{bestOption.name}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Lowest Price" value={formatCurrency(bestOption.approx_price)} />
          <MetricCard label="Potential Saving" value={formatCurrency(savingsStats.total)} />
          <MetricCard label="Monthly Estimate" value={formatCurrency(savingsStats.monthly)} />
          <MetricCard label="Options Found" value={String(alternatives.length)} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCopySummary}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-100"
          >
            {summaryCopied ? 'Summary Copied' : 'Copy Savings Summary'}
          </button>
          <button
            type="button"
            onClick={onFindNearby}
            disabled={loadingNearby}
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400"
          >
            {loadingNearby ? (
              <span className="inline-flex items-center gap-2">
                {loadingSpinner}
                Finding Nearby...
              </span>
            ) : (
              'Find Nearby Pharmacies'
            )}
          </button>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-white/60 bg-white/85 p-5 shadow-lg backdrop-blur">
          <h3 className="text-lg font-bold text-slate-900">Alternative List</h3>
          <div className="mt-3 space-y-2">
            {otherOptions.map((option) => (
              <div
                key={`${option.generic}-${option.name}`}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <p className="text-sm font-semibold text-slate-900">{option.name}</p>
                <p className="text-xs text-slate-500">{option.generic}</p>
                <p className="mt-1 text-sm font-bold text-emerald-700">
                  {formatCurrency(option.approx_price)}
                </p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-white/60 bg-white/85 p-5 shadow-lg backdrop-blur">
          <h3 className="text-lg font-bold text-slate-900">Generic Mapping</h3>
          <div className="mt-3 space-y-2">
            {mappings.map((item) => (
              <div
                key={`${item.input}-${item.generic}`}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <p className="text-sm font-semibold text-slate-800">{item.input}</p>
                <p className="text-xs text-slate-500">Generic: {item.generic}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-white/60 bg-white/85 p-5 shadow-lg backdrop-blur">
        <h3 className="text-lg font-bold text-slate-900">Nearby Pharmacies</h3>
        {nearbyStores.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Click “Find Nearby Pharmacies” to load nearby medical stores.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {nearbyStores.map((store) => (
              <li
                key={`${store.name}-${store.map_link}`}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <p className="text-sm font-semibold text-slate-900">{store.name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {Number(store.distance_km).toFixed(2)} km away
                </p>
                {store.address && <p className="text-xs text-slate-500">{store.address}</p>}
                <a
                  href={store.map_link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-100"
                >
                  Open in Maps
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-xl backdrop-blur">
        <h2 className="text-2xl font-black text-slate-900">MediGuide Assistant</h2>
        <p className="mt-1 text-sm text-slate-600">
          Ask safety, dosage, and usage questions with context-aware guidance.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setChatInput(prompt)}
              className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-100"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="mt-4 h-96 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
          {chatMessages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                message.role === 'user'
                  ? 'ml-auto bg-slate-900 text-white'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200'
              }`}
            >
              {message.content}
            </div>
          ))}
        </div>

        <form className="mt-3 flex gap-2" onSubmit={onSubmit}>
          <input
            type="text"
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            placeholder="Ask your medicine question..."
          />
          <button
            type="submit"
            disabled={sendingChat}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:bg-emerald-300"
          >
            {sendingChat ? loadingSpinner : 'Send'}
          </button>
        </form>
      </section>

      <aside className="rounded-3xl border border-white/70 bg-white/85 p-5 shadow-xl backdrop-blur">
        <h3 className="text-lg font-black text-slate-900">Safety Checklist</h3>
        <p className="mt-1 text-xs text-slate-500">
          Confirm these steps before final medicine purchase.
        </p>
        <div className="mt-4 space-y-2">
          {[
            ['dosage', 'Dose verified with prescription'],
            ['interaction', 'Checked food/drug interactions'],
            ['doctor', 'Doctor/pharmacist confirmation'],
          ].map(([key, label]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={checklist[key]}
                onChange={(event) =>
                  setChecklist((current) => ({
                    ...current,
                    [key]: event.target.checked,
                  }))
                }
                className="h-4 w-4 accent-emerald-600"
              />
              {label}
            </label>
          ))}
        </div>
      </aside>
    </div>
  )
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-white/85 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-black text-slate-900">{value}</p>
    </div>
  )
}

function FeatureCard({ title, description }) {
  return (
    <article className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur transition duration-300 hover:-translate-y-1 hover:bg-white/15">
      <h2 className="text-base font-bold text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-200">{description}</p>
    </article>
  )
}

export default App
