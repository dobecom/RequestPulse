import { parseConfigText } from './configParser'

const sampleApplicationHost = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.applicationHost>
    <applicationPools>
      <add name="Legacy-Commerce-32bit"
           queueLength="5000"
           enable32BitAppOnWin64="true"
           managedRuntimeVersion="v4.0"
           startMode="AlwaysRunning">
        <processModel loadUserProfile="true" maxProcesses="4" />
        <failure rapidFailProtection="false" />
        <recycling logEventOnRecycle="Time,Requests,Schedule,Memory,PrivateMemory">
          <periodicRestart time="00:15:00" privateMemory="1200000" />
        </recycling>
      </add>
      <add name="Burst-API"
           queueLength="200"
           managedRuntimeVersion=""
           startMode="AlwaysRunning" />
      <add name="Static-Content" managedRuntimeVersion="" />
    </applicationPools>
    <sites>
      <site name="Commerce Portal" id="1">
        <application path="/" applicationPool="Legacy-Commerce-32bit">
          <virtualDirectory path="/" physicalPath="C:\\Sites\\Commerce" />
        </application>
        <application path="/api" applicationPool="Burst-API">
          <virtualDirectory path="/" physicalPath="C:\\Sites\\CommerceApi" />
        </application>
        <bindings>
          <binding protocol="http" bindingInformation="*:80:shop.example.test" />
          <binding protocol="https" bindingInformation="*:443:shop.example.test" />
          <binding protocol="net.tcp" bindingInformation="808:*" />
        </bindings>
      </site>
      <site name="Legacy FTP Exchange" id="2">
        <application path="/" applicationPool="Static-Content">
          <virtualDirectory path="/" physicalPath="D:\\Exchange" />
        </application>
        <bindings>
          <binding protocol="ftp" bindingInformation="*:21:" />
        </bindings>
        <ftpServer serverAutoStart="true">
          <security>
            <ssl controlChannelPolicy="SslAllow" dataChannelPolicy="SslAllow" />
          </security>
        </ftpServer>
      </site>
    </sites>
  </system.applicationHost>
  <system.webServer>
    <globalModules>
      <add name="ApplicationRequestRouting" image="%ProgramFiles%\\IIS\\Application Request Routing\\requestRouter.dll" />
      <add name="RewriteModule" image="%SystemRoot%\\system32\\inetsrv\\rewrite.dll" />
      <add name="ManagedEngineV4.0_32bit" image="%windir%\\Microsoft.NET\\Framework\\v4.0.30319\\webengine4.dll" />
    </globalModules>
    <proxy enabled="true" preserveHostHeader="true" timeout="00:10:00" />
    <directoryBrowse enabled="true" />
    <httpErrors errorMode="Detailed" />
    <security>
      <requestFiltering allowDoubleEscaping="true">
        <requestLimits maxAllowedContentLength="1073741824" />
      </requestFiltering>
      <authentication>
        <anonymousAuthentication enabled="true" />
        <basicAuthentication enabled="true" />
        <windowsAuthentication enabled="true" useAppPoolCredentials="true" />
      </authentication>
    </security>
  </system.webServer>
</configuration>`

const sampleWebConfig = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.web>
    <compilation debug="true" targetFramework="4.8" />
    <httpRuntime executionTimeout="1800" maxRequestLength="102400" />
    <sessionState mode="InProc" cookieless="UseUri" timeout="120" />
    <customErrors mode="Off" />
    <httpCookies httpOnlyCookies="false" requireSSL="false" />
    <identity impersonate="true" />
    <trace enabled="true" localOnly="false" requestLimit="100" />
  </system.web>
  <system.webServer>
    <directoryBrowse enabled="true" />
    <security>
      <requestFiltering allowDoubleEscaping="true">
        <requestLimits maxAllowedContentLength="1073741824" />
      </requestFiltering>
      <authentication>
        <windowsAuthentication enabled="true" useAppPoolCredentials="true" />
      </authentication>
    </security>
  </system.webServer>
  <sampleVendor telemetryToken="synthetic-secret-for-preview" compatibilityMode="legacy" />
</configuration>`

export const sampleConfigFiles = [
  parseConfigText(
    sampleApplicationHost,
    'Synthetic-applicationHost.config',
    sampleApplicationHost.length,
    'config-applicationhost',
  ),
  parseConfigText(
    sampleWebConfig,
    'Synthetic-web.config',
    sampleWebConfig.length,
    'config-web',
  ),
]
