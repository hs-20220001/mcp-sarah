$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$errors = [System.Collections.Generic.List[string]]::new()

$requiredPaths = @(
  'AGENTS.md',
  '.specs/README.md',
  '.specs/active-change.md',
  '.specs/changes',
  '.specs/decisions',
  '.specs/memory/project-facts.md',
  '.specs/memory/risks-and-gotchas.md',
  '.specs/shared/project-map.md',
  '.specs/shared/commands.md',
  '.specs/shared/documentation-sources.md',
  '.specs/shared/validation-and-learning.md',
  '.specs/templates/feature.md',
  '.specs/templates/bugfix.md',
  '.specs/templates/decision.md',
  '.specs/templates/sensitive-change.md',
  'docs/architecture.md',
  'docs/getting-started.md',
  'docs/tools.md',
  'docs/security.md',
  'dashboard/index.html'
)

foreach ($relativePath in $requiredPaths) {
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $relativePath))) {
    $errors.Add("Caminho obrigatório ausente: $relativePath")
  }
}

$activeChangePath = Join-Path $projectRoot '.specs/active-change.md'
if (Test-Path -LiteralPath $activeChangePath) {
  $activeChange = Get-Content -Raw -LiteralPath $activeChangePath
  $changeMatch = [regex]::Match($activeChange, '(?m)^change:\s*(.+)$')
  $statusMatch = [regex]::Match($activeChange, '(?m)^status:\s*(planned|in_progress|validated|concluded)$')
  if (-not $changeMatch.Success) {
    $errors.Add('A mudança ativa não declara change no frontmatter.')
  } else {
    $target = Join-Path (Join-Path $projectRoot '.specs') $changeMatch.Groups[1].Value.Trim()
    if (-not (Test-Path -LiteralPath $target)) { $errors.Add('O arquivo apontado por active-change.md não existe.') }
  }
  if (-not $statusMatch.Success) { $errors.Add('O status da mudança ativa é inválido.') }
}

$skillsRoot = Join-Path $projectRoot '.agents/skills'
if (Test-Path -LiteralPath $skillsRoot) {
  foreach ($skillDirectory in Get-ChildItem -LiteralPath $skillsRoot -Directory) {
    $skillFile = Join-Path $skillDirectory.FullName 'SKILL.md'
    $metadataFile = Join-Path $skillDirectory.FullName 'agents/openai.yaml'
    if (-not (Test-Path -LiteralPath $skillFile)) {
      $errors.Add("SKILL.md ausente em $($skillDirectory.Name).")
      continue
    }
    $skill = Get-Content -Raw -LiteralPath $skillFile
    if ($skill -notmatch '(?s)^---\r?\nname:\s*[a-z0-9-]+\r?\ndescription:\s*.+?\r?\n---') {
      $errors.Add("Frontmatter inválido em $($skillDirectory.Name).")
    }
    if ($skill -match '\[TODO') { $errors.Add("Placeholder TODO em $($skillDirectory.Name).") }
    if (-not (Test-Path -LiteralPath $metadataFile)) { $errors.Add("agents/openai.yaml ausente em $($skillDirectory.Name).") }
  }
}

$gitignore = Get-Content -Raw -LiteralPath (Join-Path $projectRoot '.gitignore')
if ($gitignore -notmatch '(?m)^\.env$') { $errors.Add('.gitignore precisa ignorar .env.') }

$secretPattern = '(?i)(AZURE_DEVOPS_PAT|WP_APPLICATION_PASSWORD)\s*=\s*[^\s<]+$'
$excludedDirectories = @('node_modules', 'dist', 'coverage', '.git', '.local')
$scanFiles = @(
  Get-ChildItem -LiteralPath $projectRoot -File
  Get-ChildItem -LiteralPath $projectRoot -Directory |
    Where-Object { $_.Name -notin $excludedDirectories } |
    ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Recurse -File }
) | Where-Object { $_.Name -notlike '.env*' -and $_.FullName -ne $PSCommandPath }
foreach ($file in $scanFiles) {
  $matches = Select-String -LiteralPath $file.FullName -Pattern $secretPattern -ErrorAction SilentlyContinue
  if ($matches) { $errors.Add("Possível segredo versionado em $($file.FullName.Substring($projectRoot.Length + 1)).") }
}

if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host 'Workflow de IA validado com sucesso.'
