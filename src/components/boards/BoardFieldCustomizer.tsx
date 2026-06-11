'use client'

import { useState } from 'react'
import { BOARD_TEMPLATES, ALL_FIELD_OPTIONS } from '@/lib/boardTemplates'

interface BoardFieldCustomizerProps {
  onSave: (visibleFields: string[], customStages: string[]) => void
  initialVisibleFields?: string[]
  initialCustomStages?: string[]
}

export function BoardFieldCustomizer({
  onSave,
  initialVisibleFields,
  initialCustomStages,
}: BoardFieldCustomizerProps) {
  const [step, setStep] = useState<'template' | 'customize'>('template')
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [visibleFields, setVisibleFields] = useState(initialVisibleFields || [])
  const [customStages, setCustomStages] = useState(initialCustomStages || [])
  const [newStage, setNewStage] = useState('')

  const handleTemplateSelect = (templateKey: string) => {
    const template = BOARD_TEMPLATES[templateKey]
    setVisibleFields(template.visibleFields)
    setCustomStages(template.customStages)
    setSelectedTemplate(templateKey)
    setStep('customize')
  }

  const handleFieldToggle = (fieldId: string) => {
    setVisibleFields(prev =>
      prev.includes(fieldId)
        ? prev.filter(f => f !== fieldId)
        : [...prev, fieldId]
    )
  }

  const handleAddStage = () => {
    if (newStage.trim() && !customStages.includes(newStage.trim())) {
      setCustomStages([...customStages, newStage.trim()])
      setNewStage('')
    }
  }

  const handleRemoveStage = (stage: string) => {
    setCustomStages(customStages.filter(s => s !== stage))
  }

  const handleSave = () => {
    onSave(visibleFields, customStages)
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      {step === 'template' ? (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Choose a template</h3>
            <p className="text-sm text-slate-600 mb-4">
              Select a preset or customize fields later
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Object.entries(BOARD_TEMPLATES).map(([key, template]) => (
              <button
                key={key}
                onClick={() => handleTemplateSelect(key)}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  selectedTemplate === key
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <h4 className="font-semibold text-slate-900">{template.name}</h4>
                <p className="text-sm text-slate-600 mt-1">{template.description}</p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Customize fields</h3>

            {/* Fields */}
            <div className="mb-6">
              <label className="text-sm font-medium text-slate-700 block mb-3">
                Project card fields
              </label>
              <div className="space-y-2">
                {ALL_FIELD_OPTIONS.map(option => (
                  <label key={option.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded">
                    <input
                      type="checkbox"
                      checked={visibleFields.includes(option.id)}
                      onChange={() => handleFieldToggle(option.id)}
                      className="rounded border-slate-300"
                    />
                    <span className="text-sm text-slate-700">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Project Stages */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-3">
                Project stages
              </label>
              <div className="space-y-2">
                {customStages.map(stage => (
                  <div
                    key={stage}
                    className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-200"
                  >
                    <span className="text-sm text-slate-700 capitalize">{stage.replace(/_/g, ' ')}</span>
                    <button
                      onClick={() => handleRemoveStage(stage)}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={newStage}
                  onChange={e => setNewStage(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleAddStage()}
                  placeholder="Add new stage..."
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                <button
                  onClick={handleAddStage}
                  className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-4 border-t border-slate-200">
            <button
              onClick={() => setStep('template')}
              className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Back
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 ml-auto"
            >
              Save customization
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
