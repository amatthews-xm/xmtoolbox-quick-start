// See README.md for a description of this script.
const fs = require('fs');
const { np, prod, xm } = require('./config');

const env = np;
const peoplePath = './examples/Single_Record_Everbridge.csv';
const groupsPath = './examples/groups.csv';

peopleAndGroups();

async function peopleAndGroups() {
  const peopleFields = [
    //'externalKey',
    //'externallyOwned',
    'firstName',
    //'id',
    'language',
    'lastName',
    //'phoneLogin',
    //'properties',
    'recipientType',
    'roles',
    'site',
    'status',
    'supervisors',
    'targetName',
    'timezone',
    'webLogin',
  ];

  const deviceFields = ['deviceType', 'name', 'owner', 'targetName', 'emailAddress', 'phoneNumber'];

  const groupFields = ['name', 'description'];

  // All of these options are optional. These are included for example purposes.
  // Docs:  https://brannonvann.github.io/xmtoolbox/module-sync.html#~SyncOptions
  const syncOptions = {
    people: true,
    devicesOptions: { fields: deviceFields },
    devices: true,
    peopleOptions: { fields: peopleFields },
    groups: true,
    groupTransform: (group, sourceData, destinationData) => {
      if (!destinationData.groups.find(g => g.targetName === group.targetName)) {
        group.description = '[NEW] ' + group.description;
      }
      return group;
    },
    groupsFilter: g => g.targetName.startsWith('Example Group'),
    groupsOptions: { fields: groupFields },
    groupsQuery: { search: 'Example Group' },
    dataExtracted: (destinationData, destinationEnv, sourceData, sourceEnv) => {
      const text = JSON.stringify(destinationData);
      const date = new Date();
      const path = `./data/${destinationEnv.subdomain}-${date.toISOString()}.backup.json`;
      fs.writeFileSync(path, text);
    },
  };

  const json = await xm.util.CsvToJsonFromFile(peoplePath);

  const devices = [];
  const people = [];
  const removePeople = [];
  json.map(row => {
    if (row.Operation === 'remove') {
      removePeople.push(row.User);
    }

    const person = {}; //create an object that matches the person object in the xMatters REST documentation

    //pull each of the person properties from the row of data ans assign to the person.
    person.recipientType = 'PERSON';
    person.targetName = row.User;
    person.status = 'ACTIVE';
    //person.properties['Paging Role'] = "Individual Contributor";
    if (row['First Name']) person.firstName = row['First Name'];
    if (row['Last Name']) person.lastName = row['Last Name'];
    if (row.Language) person.language = xm.dictionary.language.codeByName[row.Language];
    if (row['Time Zone']) person.timezone = row['Time Zone'];
    if (row.User) person.webLogin = row.User;
    if (row.Role) person.roles = row.Role.split('|');
    if (row.Site) person.site = row['Site'];
    if (row['User Supervisor']) person.supervisors = row['User Supervisor'].split('|');

    //add the person to the array of people.
    people.push(person);

    //synced devices: Work Email, Home Email, SMS Phone, Work Phone. Seperated for clarity.
    if (row['Work Email']) {
      devices.push({
        deviceType: 'EMAIL',
        name: 'Work Email',
        owner: row.User,
        targetName: `${row.User}|Work Email`,
        emailAddress: row['Work Email'],
      });
    }

    if (row['Home Email']) {
      devices.push({
        deviceType: 'EMAIL',
        name: 'Home Email',
        owner: row.User,
        targetName: `${row.User}|Home Email`,
        emailAddress: row['Home Email'],
      });
    }

    if (row['SMS Phone']) {
      devices.push({
        deviceType: 'TEXT_PHONE',
        name: 'SMS Phone',
        owner: row.User,
        targetName: `${row.User}|SMS Phone`,
        phoneNumber: row['SMS Phone'],
      });
    }

    if (row['Work Phone']) {
      devices.push({
        deviceType: 'VOICE',
        name: 'Work Phone',
        owner: row.User,
        targetName: `${row.User}|Work Phone`,
        phoneNumber: row['Work Phone'],
      });
    }
  });

  const groups = await xm.util.CsvToJsonFromFile(groupsPath);

  const data = { people, groups, devices };
  const { syncResults } = await xm.sync.DataToxMatters(data, env, syncOptions);

  if (syncResults.failure) {
    console.log('upload failed');
    console.log(...env.errors.map(e => e.message));
  } else {
    //remove anyone who was marked as 'remove' using the operation column in csv
    await Promise.all(removePeople.map(targetName => xm.people.delete(env, targetName)));
  }
}
