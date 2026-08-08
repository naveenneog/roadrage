# Finds Azure OpenAI image-generation deployments across the subscription.
# Read-only: lists accounts, then their model deployments, filtered to image models.
$ErrorActionPreference = 'SilentlyContinue'

$accounts = az cognitiveservices account list `
  --query "[?kind=='OpenAI' || kind=='AIServices'].{name:name, rg:resourceGroup, loc:location, ep:properties.endpoint}" `
  -o json | ConvertFrom-Json

$found = @()
foreach ($a in $accounts) {
  $deps = az cognitiveservices account deployment list -n $a.name -g $a.rg `
    --query "[].{model:properties.model.name, version:properties.model.version, dep:name, sku:sku.name, cap:sku.capacity}" `
    -o json 2>$null | ConvertFrom-Json
  if (-not $deps) { continue }
  foreach ($d in $deps) {
    if ($d.model -match 'image|dall') {
      $found += [pscustomobject]@{
        Account = $a.name; RG = $a.rg; Loc = $a.loc
        Deployment = $d.dep; Model = $d.model; Version = $d.version
        Sku = $d.sku; Capacity = $d.cap; Endpoint = $a.ep
      }
    }
  }
}

if ($found.Count -eq 0) {
  Write-Host "No image-generation deployments found."
} else {
  $found | Format-Table Account, RG, Loc, Deployment, Model, Version, Sku, Capacity -AutoSize
}
