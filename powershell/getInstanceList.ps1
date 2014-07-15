param(
[string]$OutputFile
)

## anzlabFrontEnd getInstanceList
## v0.1 19/05/2014
## PowerShell 2.0
##

##
## Configuration

$vCenter = "labs-vcenter.gp.cv.commvault.com"

##
## Script Dependencies

Add-Type -Assembly System.ServiceModel.Web, System.Runtime.Serialization
$utf8 = [System.Text.Encoding]::UTF8
$VMSnapInLoaded = Get-PSSnapin | Where-Object { $_.Name -like "*VMware*" }
If (!$VMSnapInLoaded) {
    Add-PSSnapIn VMware.VimAutomation.Core -ErrorAction SilentlyContinue
}

##
## Script Functions

Function ExitWithCode ($exitcode)
{
    $host.SetShouldExit($exitcode)
    exit
}

Function Connect-VMware ([string]$vCenter)
{
    Write-Debug "[+] Connecting to vCenter $vCenter"
    try {
        $result = Set-PowerCLIConfiguration -DefaultVIServerMode Single -InvalidCertificateAction Ignore -Confirm:$false
        $result = Connect-VIServer -Server $vCenter -Force -Verbose -WarningAction SilentlyContinue
        #Write-Output "Global value AFTER Disconnect-VIserver AND AFTER Connect-VIServer is: $global:defaultviservers"  
    }
    catch {
        Write-Host "ERR either connecting to VMware or setting PowerCLI configuration: " $_
        ExitWithCode(102)
    }
}

function Write-Stream {
PARAM(
   [Parameter(Position=0)]$stream,
   [Parameter(ValueFromPipeline=$true)]$string
)
PROCESS {
  $bytes = $utf8.GetBytes($string)
  $stream.Write( $bytes, 0, $bytes.Length )
}  
}

function Read-Stream {
PARAM(
   [Parameter(Position=0,ValueFromPipeline=$true)]$Stream
)
process {
   $bytes = $Stream.ToArray()
   [System.Text.Encoding]::UTF8.GetString($bytes,0,$bytes.Length)
}}

function Convert-JsonToXml {
PARAM([Parameter(ValueFromPipeline=$true)][string[]]$json)
BEGIN { 
   $mStream = New-Object System.IO.MemoryStream 
}
PROCESS {
   $json | Write-Stream -Stream $mStream
}
END {
   $mStream.Position = 0
   try
   {
      $jsonReader = [System.Runtime.Serialization.Json.JsonReaderWriterFactory]::CreateJsonReader($mStream,[System.Xml.XmlDictionaryReaderQuotas]::Max)
      $xml = New-Object Xml.XmlDocument
      $xml.Load($jsonReader)
      $xml
   }
   finally
   {
      $jsonReader.Close()
      $mStream.Dispose()
   }
}
}
 
function Convert-XmlToJson {
PARAM([Parameter(ValueFromPipeline=$true)][Xml]$xml)
PROCESS {
   $mStream = New-Object System.IO.MemoryStream
   $jsonWriter = [System.Runtime.Serialization.Json.JsonReaderWriterFactory]::CreateJsonWriter($mStream)
   try
   {
     $xml.Save($jsonWriter)
     $bytes = $mStream.ToArray()
     [System.Text.Encoding]::UTF8.GetString($bytes,0,$bytes.Length)
   }
   finally
   {
     $jsonWriter.Close()
     $mStream.Dispose()
   }
}
}

function New-Json {
[CmdletBinding()]
param([Parameter(ValueFromPipeline=$true)][HashTable]$InputObject) 
begin { 
   $ser = @{}
   $jsona = @()
}
process {
   $jsoni = 
   foreach($input in $InputObject.GetEnumerator() | Where { $_.Value } ) {
      if($input.Value -is [Hashtable]) {
         '"'+$input.Key+'": ' + (New-JSon $input.Value)
      } else {
         $type = $input.Value.GetType()
         if(!$Ser.ContainsKey($Type)) {
            $Ser.($Type) = New-Object System.Runtime.Serialization.Json.DataContractJsonSerializer $type
         }
         $stream = New-Object System.IO.MemoryStream
         $Ser.($Type).WriteObject( $stream, $Input.Value )
         '"'+$input.Key+'": ' + (Read-Stream $stream)
      }
   }

   $jsona += "{`n" +($jsoni -join ",`n")+ "`n}"
}
end { 
   if($jsona.Count -gt 1) {
      "[$($jsona -join ",`n")]" 
   } else {
      $jsona
   }
}}

##
## Main Routine

Connect-VMware($vCenter)

$jumpboxes = @{}
Get-VM SandPit*-JumpBox | foreach {
    $jumpboxes.Add($_.Name, @{})
    $jumpboxes[$_.Name].Add("State", $_.Guest.State.ToString())
    Foreach($ip in $_.Guest.IPAddress) {
      if ($ip -like "172.16.7.*") {
        $jumpboxes[$_.Name].Add("IP", $ip)
      }
    }

    if($_.Guest.State -eq "Running") {
      $ts = New-TimeSpan -Seconds $($_ | Get-Stat -stat "sys.uptime.latest" -maxsamples 1).Value
      $jumpboxes[$_.Name].Add("Uptime", ('{0:00d} {1:00h} {2:00m}' -f $ts.Days, $ts.Hours, $ts.Minutes))
    } else {
      $jumpboxes[$_.Name].Add("Uptime", "na")
    }
}

$jumpboxes | New-Json | Out-File $OutputFile
ExitWithCode(0)

## END