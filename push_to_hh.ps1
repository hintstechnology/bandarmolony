# Script to commit and push changes to origin/hh
cd "d:\Hilmy\Kerja\Hints Technology\bandarmolony-main"

Write-Host "Current branch:" -ForegroundColor Yellow
git branch --show-current

Write-Host "`nGit status:" -ForegroundColor Yellow
git status

Write-Host "`nAdding all changes..." -ForegroundColor Yellow
git add -A

Write-Host "`nCommitting changes..." -ForegroundColor Yellow
git commit -m "fix: prevent data update before Show button clicked"

Write-Host "`nPushing to origin/hh..." -ForegroundColor Yellow
git push origin hh

Write-Host "`nLatest commit:" -ForegroundColor Yellow
git log --oneline -1

Write-Host "`nDone!" -ForegroundColor Green
