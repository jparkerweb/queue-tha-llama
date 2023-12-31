# Add Windows Forms for open file dialog
Add-Type -AssemblyName System.Windows.Forms

# Function to open a file dialog and return the selected file path
function Select-File($title, $filter) {
    $fileDialog = New-Object System.Windows.Forms.OpenFileDialog
    $fileDialog.Title = $title
    $fileDialog.Filter = $filter
    $result = $fileDialog.ShowDialog()

    if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
        return $fileDialog.FileName
    } else {
        return $null
    }
}

# Ask user to select server.exe
$serverExePath = Select-File "Select server.exe" "server.exe|server.exe"
if (-not $serverExePath) {
    Write-Host "No file selected for server.exe, exiting script."
    exit
}

# Ask user to select a model file with .gguf extension
$modelFilePath = Select-File "Select a model file" "GGUF files (*.gguf)|*.gguf"
if (-not $modelFilePath) {
    Write-Host "No file selected for the model file, exiting script."
    exit
}

# Ask user for context size with a default value of 2048
$contextSize = Read-Host "Enter context size (default is 2048)"
if (-not $contextSize) {
    $contextSize = 2048
}

# Ask user for the number of simultaneous requests with a default value of 2
$simultaneousRequests = Read-Host "Enter number of simultaneous requests (default is 2)"
if (-not $simultaneousRequests) {
    $simultaneousRequests = 2
}

# Construct and run the command
$command = "& `"$serverExePath`" -m `"$modelFilePath`" -c $contextSize -cb -np $simultaneousRequests"
Invoke-Expression $command
