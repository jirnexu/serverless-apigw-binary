'use strict';

class BinarySupport {
  constructor(serverless, options) {
    this.options = options || {};
    this.serverless = serverless;
    this.provider = this.serverless.getProvider(this.serverless.service.provider.name);
    this.hooks = {
      'after:deploy:deploy': this.afterDeploy.bind(this)
    };
  }

  getApiId(stage) {
    return new Promise(resolve => {
      this.provider.request('CloudFormation', 'describeStacks', { StackName: this.provider.naming.getStackName(stage) }).then(resp => {
        const output = resp.Stacks[0].Outputs;
        let apiUrl;
        output.filter(entry => entry.OutputKey === 'ServiceEndpoint').forEach(entry => apiUrl = entry.OutputValue);
        const apiIds = apiUrl.match('https:\/\/(.*)\\.execute-api')
        const apiId =  apiIds && apiIds.length ? apiIds[1] : '';
        resolve(apiId);
      });
    });
  }

  putSwagger(apiId, swagger) {
    return this.provider.request('APIGateway', 'putRestApi', { restApiId: apiId, mode: 'merge', body: swagger });
  }

  createDeployment(apiId, stage) {
    return this.provider.request('APIGateway', 'createDeployment', { restApiId: apiId, stageName: stage });
  }

  getApiGatewayName() {
    if (this.serverless.service.resources && this.serverless.service.resources.Resources) {
      const Resources = this.serverless.service.resources.Resources;
      for (let key in Resources) {
        if (Resources.hasOwnProperty(key)) {
          if (Resources[key].Type === 'AWS::ApiGateway::RestApi'
            && Resources[key].Properties.Name) {
            return Resources[key].Properties.Name;
          }
        }
      }
    }
    return this.provider.naming.getApiGatewayName();
  }

  afterDeploy() {
    const mimeTypes = this.serverless.service.custom.apigwBinary.types;
    const swaggerInput = JSON.stringify({
      "swagger": "2.0",
      "info": {
        "title": this.getApiGatewayName()
      },
      "x-amazon-apigateway-binary-media-types": mimeTypes
    });
    const stage = this.options.stage || this.serverless.service.provider.stage;

    return this.getApiId(stage).then(apiId => {
      return this.putSwagger(apiId, swaggerInput).then(() => {
        return this.createDeployment(apiId, stage);
      });
    });
  }
}

module.exports = BinarySupport;
