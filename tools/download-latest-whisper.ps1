# ================================================
# == Download the latest version of whisper.cpp ==
# ================================================
# This script will download and extract the latest version of whisper.cpp from
# https://github.com/ggerganov/whisper.cpp/releases


# Define the path for the .ini file
$iniFile = "download-latest-whisper.ini"

# Function to read the last used directory from the ini file
function Read-LastUsedDirectory {
    if (Test-Path $iniFile) {
        return Get-Content $iniFile
    } else {
        return $null
    }
}

# Function to save the selected directory to the ini file
function Save-LastUsedDirectory($directory) {
    $directory | Set-Content $iniFile
}

# Print a message and wait for user to press Enter
Write-Host ""
Write-Host "This script will download and extract the latest version of whisper.cpp"
Write-Host "from → https://github.com/ggerganov/whisper.cpp/releases'"
Write-Host ""
Write-Host "You will be asked to a version targeting your hardware capabilities and target directory"
Write-Host "Please press Enter to continue, or Ctrl + C to exit..."
Read-Host

# Present options for CPU version
Write-Host ""
Write-Host "------------------------------------------------------------------------------------"
Write-Host "Select the version of the file to download:"
Write-Host "visit https://github.com/ggerganov/whisper.cpp for more information."
Write-Host ""
Write-Host "1) bin-Win32"
Write-Host "2) bin-x64"
Write-Host "3) blas-bin-Win32"
Write-Host "4) blas-clblast-bin-x64"
Write-Host "5) cublas-11.8.0-bin-x64"
Write-Host "6) bublas-12.2.0-bin-x64"
$choice = Read-Host "Enter your choice (1, 2, 3, 4, 5 or 6)"

# Map user choice to CPU version
switch ($choice) {
    "1" { $archVersion = "bin-Win32" }
    "2" { $archVersion = "bin-x64" }
    "3" { $archVersion = "blas-bin-Win32" }
    "4" { $archVersion = "blas-clblast-bin-x64" }
    "5" { $archVersion = "cublas-11.8.0-bin-x64" }
    "6" { $archVersion = "bublas-12.2.0-bin-x64" }
    default { 
        Write-Error "Invalid choice. Exiting script."
        exit
    }
}

# Add .NET assembly for Windows Forms
Add-Type -AssemblyName System.Windows.Forms

# Check if there's a previously used directory
$lastUsedDirectory = Read-LastUsedDirectory

# Create a FolderBrowserDialog object
$folderBrowser = New-Object System.Windows.Forms.FolderBrowserDialog
$folderBrowser.Description = "Select a target directory"
if ($lastUsedDirectory -ne $null -and (Test-Path $lastUsedDirectory)) {
    $folderBrowser.SelectedPath = $lastUsedDirectory
}
$folderBrowser.ShowDialog() | Out-Null
$targetDirectory = $folderBrowser.SelectedPath

# Save the selected directory for future use
if ($targetDirectory -ne '') {
    Save-LastUsedDirectory $targetDirectory

    # GitHub API URL for the latest release
    $apiUrl = "https://api.github.com/repos/ggerganov/whisper.cpp/releases/latest"

    # Use Invoke-RestMethod to get the latest release data
    $latestRelease = Invoke-RestMethod -Uri $apiUrl -Headers @{"Accept"="application/vnd.github.v3+json"}

    # Extract the tag name
    $tagName = $latestRelease.tag_name

    # Construct the download URL
    $downloadUrl = "https://github.com/ggerganov/whisper.cpp/releases/download/$tagName/whisper-$archVersion.zip"
    # Define the local zip file path
    $zipFileName = "whisper-$archVersion.zip"
    $zipFile = Join-Path $targetDirectory $zipFileName

    # Download the zip file
    Write-Host ""
    Write-Host "------------------------------------------------------------------------------------"
    Write-Host "Downloading $archVersion version from:"
    Write-Host "https://github.com/ggerganov/whisper.cpp/releases/$tagName"
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipFile

    # Extract the zip file contents to the selected target directory
    Write-Host "------------------------------------------------------------------------------------"
    Write-Host "Extracting >> $zipFile"
    Expand-Archive -LiteralPath $zipFile -DestinationPath $targetDirectory -Force

    # Remove the downloaded zip file (optional)
    Write-Host "------------------------------------------------------------------------------------"
    Write-Host "Deleting temp zip file >> $zipFile"
    Remove-Item -Path $zipFile

    Write-Host "------------------------------------------------------------------------------------"
    Write-Host "Latest version of whisper.cpp is downloaded and ready for use!"
    Write-Host "Download compatible models from:"
    Write-Host "   https://huggingface.co/ggerganov/whisper.cpp/tree/main"
    Write-Host ""
    Write-Host "Have a great day :)"
    Write-Host ""
} else {
    Write-Host "No directory selected. Exiting script."
}