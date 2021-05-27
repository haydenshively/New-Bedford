import nfetch from 'node-fetch';

type CompoundAPIRequestValue = { value: string };

interface ICompoundAPIRequest {
  addresses?: string[];
  block_number?: number;
  max_health?: CompoundAPIRequestValue;
  min_borrow_value_in_eth?: CompoundAPIRequestValue;
  page_number?: number;
  page_size?: number;
  network?: string;
}

const fetch = async (r: ICompoundAPIRequest) => {
  const method = 'GET';
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const path = 'https://api.compound.finance/api/v2/account?';
  const params = Object.keys(r)
    .map((key) => {
      const knownKey = key as keyof ICompoundAPIRequest;
      let uri;
      switch (knownKey) {
        case 'max_health':
        case 'min_borrow_value_in_eth':
          uri = `${knownKey}[value]=${r[knownKey]!.value}`;
          return encodeURIComponent(uri).replace('%3D', '=');
        case 'addresses':
          uri = `${knownKey}=${r[knownKey]!.join(',')}`;
          return encodeURIComponent(uri);
        default:
          return `${knownKey}=${r[knownKey]}`;
      }
    })
    .join('&');

  console.log(path + params);
  const res = await nfetch(path + params, {
    method: method,
    headers: headers,
  });
  return res.json();
};

async function sleep(millis: number) {
  return new Promise((resolve) => setTimeout(resolve, millis));
}

const getBorrowers = async (minBorrow_Eth: string) => {
  let borrowers = <string[]>[];

  let i = 1;
  let pageCount = 0;

  let result;
  do {
    try {
      result = await fetch({
        min_borrow_value_in_eth: { value: minBorrow_Eth },
        page_size: 100,
        page_number: i,
      });
    } catch (e) {
      console.log(e);
      continue;
    }
    if (result.error) {
      console.warn(result.error.toString());
      continue;
    }
    if (result.accounts === undefined) continue;
    borrowers = borrowers.concat(result.accounts.map((account: any) => account.address));
    pageCount = result.pagination_summary.total_pages;
    i++;

    await sleep(200); // Avoid rate limiting
  } while (i <= pageCount);

  return borrowers;
};

export default getBorrowers;
