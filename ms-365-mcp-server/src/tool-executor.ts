import logger from './logger.js';
import GraphClient from './graph-client.js';
import type { ToolEntry, EndpointConfig } from './tool-registry.js';

export interface ToolResult {
  data: unknown;
  isError?: boolean;
}

export async function executeTool(
  entry: ToolEntry,
  graphClient: GraphClient,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const { endpoint: tool, config } = entry;

  logger.info(`Tool ${tool.alias} called with params: ${JSON.stringify(params)}`);
  try {
    const parameterDefinitions = tool.parameters || [];

    let path = tool.path;
    const queryParams: Record<string, string> = {};
    const headers: Record<string, string> = {};
    let body: unknown = null;

    for (const [paramName, paramValue] of Object.entries(params)) {
      // Skip control parameters
      if (
        [
          'fetchAllPages',
          'includeHeaders',
          'excludeResponse',
          'timezone',
          'expandExtendedProperties',
        ].includes(paramName)
      ) {
        continue;
      }

      const odataParams = [
        'filter',
        'select',
        'expand',
        'orderby',
        'skip',
        'top',
        'count',
        'search',
        'format',
      ];
      const normalizedParamName = paramName.startsWith('$') ? paramName.slice(1) : paramName;
      const isOdataParam = odataParams.includes(normalizedParamName.toLowerCase());
      const fixedParamName = isOdataParam ? `$${normalizedParamName.toLowerCase()}` : paramName;

      const paramDef = parameterDefinitions.find(
        (p) => p.name === paramName || (isOdataParam && p.name === normalizedParamName)
      );

      if (paramDef) {
        switch (paramDef.type) {
          case 'Path': {
            const shouldSkipEncoding = config?.skipEncoding?.includes(paramName) ?? false;
            const encodedValue = shouldSkipEncoding
              ? (paramValue as string)
              : encodeURIComponent(paramValue as string);

            path = path
              .replace(`{${paramName}}`, encodedValue)
              .replace(`:${paramName}`, encodedValue);
            break;
          }

          case 'Query':
            if (paramValue !== '' && paramValue != null) {
              queryParams[fixedParamName] = `${paramValue}`;
            }
            break;

          case 'Body':
            if (paramDef.schema) {
              const parseResult = paramDef.schema.safeParse(paramValue);
              if (!parseResult.success) {
                const wrapped = { [paramName]: paramValue };
                const wrappedResult = paramDef.schema.safeParse(wrapped);
                if (wrappedResult.success) {
                  logger.info(
                    `Auto-corrected parameter '${paramName}': wrapped as {${paramName}: ...}`
                  );
                  body = wrapped;
                } else {
                  body = paramValue;
                }
              } else {
                body = paramValue;
              }
            } else {
              body = paramValue;
            }
            break;

          case 'Header':
            headers[fixedParamName] = `${paramValue}`;
            break;
        }
      } else if (paramName === 'body') {
        body = paramValue;
        logger.info(`Set body param: ${JSON.stringify(body)}`);
      }
    }

    // Handle timezone parameter for calendar endpoints
    if (config?.supportsTimezone && params.timezone) {
      headers['Prefer'] = `outlook.timezone="${params.timezone}"`;
      logger.info(`Setting timezone header: Prefer: outlook.timezone="${params.timezone}"`);
    }

    // Handle expandExtendedProperties parameter
    if (config?.supportsExpandExtendedProperties && params.expandExtendedProperties === true) {
      const expandValue = 'singleValueExtendedProperties';
      if (queryParams['$expand']) {
        queryParams['$expand'] += `,${expandValue}`;
      } else {
        queryParams['$expand'] = expandValue;
      }
      logger.info(`Adding $expand=${expandValue} for extended properties`);
    }

    if (config?.contentType) {
      headers['Content-Type'] = config.contentType;
      logger.info(`Setting custom Content-Type: ${config.contentType}`);
    }

    if (Object.keys(queryParams).length > 0) {
      const queryString = Object.entries(queryParams)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
      path = `${path}${path.includes('?') ? '&' : '?'}${queryString}`;
    }

    const options: {
      method: string;
      headers: Record<string, string>;
      body?: string;
      rawResponse?: boolean;
      includeHeaders?: boolean;
      excludeResponse?: boolean;
      queryParams?: Record<string, string>;
    } = {
      method: tool.method.toUpperCase(),
      headers,
    };

    if (options.method !== 'GET' && body) {
      if (config?.contentType === 'text/html') {
        if (typeof body === 'string') {
          options.body = body;
        } else if (typeof body === 'object' && body !== null && 'content' in body) {
          options.body = (body as { content: string }).content;
        } else {
          options.body = String(body);
        }
      } else {
        options.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
    }

    const isProbablyMediaContent =
      tool.errors?.some((error) => error.description === 'Retrieved media content') ||
      path.endsWith('/content');

    if (config?.returnDownloadUrl && path.endsWith('/content')) {
      path = path.replace(/\/content$/, '');
      logger.info(
        `Auto-returning download URL for ${tool.alias} (returnDownloadUrl=true)`
      );
    } else if (isProbablyMediaContent) {
      options.rawResponse = true;
    }

    if (params.includeHeaders === true) {
      options.includeHeaders = true;
    }

    if (params.excludeResponse === true) {
      options.excludeResponse = true;
    }

    logger.info(`Making graph request to ${path} with options: ${JSON.stringify(options)}`);

    let response = await graphClient.graphRequest(path, options);

    // Handle pagination
    const fetchAllPages = params.fetchAllPages === true;
    if (fetchAllPages && response?.content?.[0]?.text) {
      try {
        let combinedResponse = JSON.parse(response.content[0].text);
        let allItems = combinedResponse.value || [];
        let nextLink = combinedResponse['@odata.nextLink'];
        let pageCount = 1;

        while (nextLink && pageCount < 100) {
          logger.info(`Fetching page ${pageCount + 1} from: ${nextLink}`);

          const url = new URL(nextLink);
          const nextPath = url.pathname.replace('/v1.0', '');
          const nextOptions = { ...options };

          const nextQueryParams: Record<string, string> = {};
          for (const [key, value] of url.searchParams.entries()) {
            nextQueryParams[key] = value;
          }
          nextOptions.queryParams = nextQueryParams;

          const nextResponse = await graphClient.graphRequest(nextPath, nextOptions);
          if (nextResponse?.content?.[0]?.text) {
            const nextJsonResponse = JSON.parse(nextResponse.content[0].text);
            if (nextJsonResponse.value && Array.isArray(nextJsonResponse.value)) {
              allItems = allItems.concat(nextJsonResponse.value);
            }
            nextLink = nextJsonResponse['@odata.nextLink'];
            pageCount++;
          } else {
            break;
          }
        }

        if (pageCount >= 100) {
          logger.warn(`Reached maximum page limit (100) for pagination`);
        }

        combinedResponse.value = allItems;
        if (combinedResponse['@odata.count']) {
          combinedResponse['@odata.count'] = allItems.length;
        }
        delete combinedResponse['@odata.nextLink'];

        response.content[0].text = JSON.stringify(combinedResponse);

        logger.info(
          `Pagination complete: collected ${allItems.length} items across ${pageCount} pages`
        );
      } catch (e) {
        logger.error(`Error during pagination: ${e}`);
      }
    }

    // Extract the data from the response
    if (response?.content?.[0]?.text) {
      const responseText = response.content[0].text;
      logger.info(`Response size: ${responseText.length} characters`);

      try {
        const parsed = JSON.parse(responseText);
        return { data: parsed, isError: response.isError };
      } catch {
        return { data: responseText, isError: response.isError };
      }
    }

    return { data: null, isError: response.isError };
  } catch (error) {
    logger.error(`Error in tool ${tool.alias}: ${(error as Error).message}`);
    return {
      data: { error: `Error in tool ${tool.alias}: ${(error as Error).message}` },
      isError: true,
    };
  }
}
