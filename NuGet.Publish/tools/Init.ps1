param($installPath, $toolsPath, $package)

$project = Get-Project

$projectFullName = $project.FullName
$debugString = "Executing Init for: " + $projectFullName
Write-Host $debugString

$fileInfo = new-object -typename System.IO.FileInfo -ArgumentList $projectFullName
$projectDirectory = $fileInfo.DirectoryName


$projectToolsPath = "$projectDirectory/$toolsDiretoryName"

if(!(Test-Path -Path "$projectFullName/project.json" )){
	Copy-Item "$installPath/dotnetcore/Gruntfile.js" $projectDirectory -Recurse -Force
	Copy-Item "$installPath/dotnetcore/package.json" $projectDirectory -Recurse -Force
	Copy-Item "$installPath/content/NuGet.exe" $projectToolsPath -Recurse -Force
}