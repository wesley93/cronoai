// Ações compartilhadas de importação/exportação do MS Project com feedback ao usuário.
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import { downloadText } from './download'

const MAX_XML_BYTES = 15 * 1024 * 1024

export function useMsProject() {
  const project = useProjectStore()
  const ui = useUiStore()

  function exportXml() {
    const { filename, xml, validation, avisos } = project.exportXml()
    if (!validation.valid) {
      ui.notify('error', 'XML não exportado: falhou na validação MSPDI', validation.errors.slice(0, 2).join(' '))
      return
    }
    downloadText(filename, xml)
    ui.notify(
      'success',
      'XML do MS Project gerado e validado',
      `${filename} · ${validation.taskCount - 1} tarefas, ${validation.linkCount} vínculos. Abra no MS Project em Arquivo › Abrir (tipo XML).`,
    )
    for (const a of avisos) ui.notify('warning', 'Atenção na exportação', a)
  }

  async function importFile(file: File) {
    if (!/\.xml$/i.test(file.name)) {
      ui.notify('error', 'Formato não suportado', 'Selecione um arquivo .xml salvo pelo MS Project (Salvar como › XML).')
      return
    }
    if (file.size > MAX_XML_BYTES) {
      ui.notify('error', 'Arquivo muito grande', 'O limite para importação no navegador é de 15 MB.')
      return
    }
    try {
      const warnings = project.importXml(await file.text())
      ui.notify('success', 'Cronograma importado', `${project.state.tasks.length} tarefas carregadas e caminho crítico recalculado.`)
      for (const w of warnings) ui.notify('warning', 'Atenção na importação', w)
    } catch (err) {
      ui.notify('error', 'Não foi possível importar', err instanceof Error ? err.message : 'Arquivo inválido.')
    }
  }

  return { exportXml, importFile }
}
