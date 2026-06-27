'use server'
/**
 * Server actions for the Resources page — owner-local provisioning of shareable
 * resources (no HTTP key-gate; installing software is owner-only). Ollama is the
 * first resource; printers/CNC modules will add siblings here.
 */
import { detectOllama, installOllama, startOllama, pullModel } from '@/lib/ollama'

export async function getResources() {
  return { ollama: await detectOllama() }
}

export async function installOllamaAction() {
  return installOllama()
}

export async function startOllamaAction() {
  return startOllama()
}

export async function pullModelAction(name: string) {
  return pullModel((name || '').trim())
}
