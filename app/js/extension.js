const Partner_tag_option_ids = { 
  hariOm: "2144856000000042097",
  Krunal: "2144856000000047307",
};
const Cluster_tag_option_ids = {
  Strateworks: "2144856000000047213",
};
const Location_tag_option_ids = {
  Surat: "2144856000000047241",
  Navsari: "2144856000000047243",
};

// Reporting Tag IDs
const REPORTING_TAGS = {
  PARTNER: "2144856000000000636",
  CLUSTER: "2144856000000000634",
  LOCATION: "2144856000000000642",
  DEPARTMENT: "2144856000000000638",
  CENTRALOFF: "2144856000000000640",
};

// Fetch Partner Data from Custom Module
async function fetchPartnerDataFromCustomModule(partnerTagOptionName) {
  console.log("Flow enter in fetchPartnerDataFromCustomModule()");
  console.log("partnerTagOptionName",partnerTagOptionName);
  
  try {
    const options = {
      url: 'https://www.zohoapis.in/books/v3/cm__in_rxupsfh_partnerdata_1?organization_id=60034848153',
      method: "GET",
      url_query: [
        {
          key: 'cf__in_rxupsfh_partner',
          value: partnerTagOptionName,
        },
      ],
      connection_link_name: 'books',
    };

    const value = await ZFAPPS.request(options);
    const responseJSON = JSON.parse(value.data.body);

    if (responseJSON?.module_records?.length > 0) {
      const partnerData = responseJSON.module_records[0];
  console.log("Flow exit from fetchPartnerDataFromCustomModule()");

      return {
        cluster: partnerData.cf__in_rxupsfh_cluster || "",
        location: partnerData.cf__in_rxupsfh_location || "",
      };
    } else {
  console.log("Flow exit from fetchPartnerDataFromCustomModule()");

      return null;
    }
  } catch (error) {

    console.error("Error fetching data from custom module:", error);
  console.log("Flow exit from fetchPartnerDataFromCustomModule()");

    return null;
  }

}

// Auto-Populate Cluster and Location Tags
async function autoPopulateClusterAndLocation(lineItems) {
  console.log("Starting autoPopulateClusterAndLocation...");

  let anyChangesMade = false;

  for (const [index, item] of lineItems.entries()) {
    console.log(`Processing line item ${index + 1}...`);

    const tags = item.tags || [];
    console.log("Initial Tags:", JSON.stringify(tags, null, 2));

    const partnerTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.PARTNER);
    console.log("Partner Tag:", partnerTag);

    if (!partnerTag?.tag_option_id) {
      console.log("No valid Partner Tag found. Skipping...");
      continue;
    }

    const partnerTagOptionName = Object.keys(Partner_tag_option_ids).find(
      key => Partner_tag_option_ids[key] === partnerTag.tag_option_id
    );
    console.log("Partner Tag Option Name:", partnerTagOptionName);

    if (!partnerTagOptionName) {
      console.log("Partner Tag Option Name not found in Partner_tag_option_ids. Skipping...");
      continue;
    }

    const fetchedData = await fetchPartnerDataFromCustomModule(partnerTagOptionName);
    console.log("Fetched Data from Custom Module:", fetchedData);

    if (!fetchedData) {
      console.warn("No data fetched for Partner:", partnerTagOptionName);
      continue;
    }

    const { cluster, location } = fetchedData;
    console.log(`Cluster: ${cluster}, Location: ${location}`);

    // Update or create Cluster Tag
    let clusterTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.CLUSTER);
    if (!clusterTag) {
      clusterTag = { tag_id: REPORTING_TAGS.CLUSTER, tag_option_id: "" };
      tags.push(clusterTag);
    }
    if (cluster) {
      clusterTag.tag_option_id = Cluster_tag_option_ids[cluster] || "";
    }

    // Update or create Location Tag
    let locationTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.LOCATION);
    if (!locationTag) {
      locationTag = { tag_id: REPORTING_TAGS.LOCATION, tag_option_id: "" };
      tags.push(locationTag);
    }
    if (location) {
      locationTag.tag_option_id = Location_tag_option_ids[location] || "";
    }

    console.log("Updated Tags:", JSON.stringify(tags, null, 2));

    // Update the line item with the modified tags
    item.tags = tags;
    anyChangesMade = true;
  }

  if (anyChangesMade) {
    console.log("Updating the invoice with modified line items...");
    const updateResponse = await ZFAPPS.set("invoice.line_items", lineItems);
    console.log("Update Response:", updateResponse);
  } else {
    console.warn("No changes made to the line items. Skipping update.");
  }

  console.log("Completed autoPopulateClusterAndLocation.");
}





// Validate Reporting Tags
function validateReportingTags(lineItems) {
  console.log("Flow enter in validateReportingTags()");

  const errors = [];

  for (const item of lineItems) {
    const tags = item.tags || [];
    const tagMap = Object.fromEntries(tags.map(tag => [tag.tag_id, tag.tag_option_id]));
    console.log(tagMap);
    

    const allTagsEmpty = Object.keys(REPORTING_TAGS).every(key => !tagMap[REPORTING_TAGS[key]]);
    if (allTagsEmpty) {
      alert("All Reporting tags are empty for one or more line items.");
      errors.push("All Reporting tags are empty for one or more line items.");
    }

    const partnerFilled = !!tagMap[REPORTING_TAGS.PARTNER];
    const departmentFilled = !!tagMap[REPORTING_TAGS.DEPARTMENT];

    if (partnerFilled && departmentFilled) {
      alert("Please select either Partner or Department, not both.");
      errors.push("Please select either Partner or Department, not both.");
    }

    const otherTagsFilled = [REPORTING_TAGS.CLUSTER, REPORTING_TAGS.LOCATION, REPORTING_TAGS.CENTRALOFF].some(
      tagId => !!tagMap[tagId]
    );

    

    if ((!partnerFilled && !departmentFilled) && otherTagsFilled) {
      alert("Partner or Department must be selected if other tags are filled.");
      errors.push("Partner or Department must be selected if other tags are filled.");
    }
  console.log("Flow exit from validateReportingTags()");

  }

  return errors;
}

// Integrate Logic with Zoho Books Pre-Save Hook
ZFAPPS.extension.init().then(App => {
  App.instance.on("ON_INVOICE_PRE_SAVE", async () => {
    return new Promise(async (resolve) => {
      try {
        const response = await ZFAPPS.get("invoice");
        console.log("response",response);
        
        const invoice = response?.invoice || response;
        const lineItems = invoice.line_items || [];

        const validationErrors = validateReportingTags(lineItems);
        if (validationErrors.length > 0) {
          resolve({ prevent_save: true, message: validationErrors.join("\n") });
          return;
        }

        await autoPopulateClusterAndLocation(lineItems);

        console.log("Function Going to end.");
        

        await resolve({ prevent_save: false });

      } catch (error) {
        console.error("Error during pre-save processing:", error);
        resolve({ prevent_save: true, message: "An error occurred while validating the invoice data." });
      }
    });
  });
});

// const Partner_tag_option_ids = { 
//   hariOm: "2144856000000042097",
//   Krunal: "2144856000000047307"
// };
// const Cluster_tag_option_ids = {
//   Strateworks: "2144856000000047213"
// };
// const Location_tag_option_ids = {
//   Surat: "2144856000000047241",
//   Navsari: "2144856000000047243"
// };
// //  Custom module API names
//   const CustomModuleApiNames = {
//     PartnerDatas: "cm__in_rxupsfh_partnerdata_1",
//   };
  
//   // Custom module field API names
//   const CustomModuleFieldApiNames = {
//     Partner: "cf__in_rxupsfh_partner",
//     Cluster: "cf__in_rxupsfh_cluster",
//     location: "cf__in_rxupsfh_location",
//   };
  
// const REPORTING_TAGS = {
//   PARTNER: "2144856000000000636",
//   CLUSTER: "2144856000000000634",
//   LOCATION: "2144856000000000642",
//   DEPARTMENT: "2144856000000000638",
//   CENTRAL_OFF: "2144856000000000640"
// };

// async function fetchPartnerDataFromCustomModule(partnerTagOptionName) {
//   console.log("Fetching Partner Data:", partnerTagOptionName);

//   try {
//     const response = await ZFAPPS.connection.invoke({
//       name: "books",
//       operation: "GET",
//       endpoint: `/${CustomModuleApiNames.PartnerDatas}`,
//       params: {
//         criteria: `${CustomModuleFieldApiNames.Partner}:equals:${partnerTagOptionName}`
//       }
//     });

//     if (response?.data?.length > 0) {
//       const partnerData = response.data[0];
//       return {
//         cluster: partnerData[CustomModuleFieldApiNames.Cluster] || "",
//         location: partnerData[CustomModuleFieldApiNames.location] || ""
//       };
//     }
//   } catch (error) {
//     console.error("Error fetching partner data:", error);
//   }
//   return { cluster: "", location: "" };
// }

// async function autoPopulateClusterAndLocation(lineItems) {
//   console.log("Auto-populating Cluster and Location...");

//   for (const item of lineItems) {
//     const tags = item.tags || [];
//     const partnerTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.PARTNER);

//     if (!partnerTag) continue;

//     const partnerTagOptionId = partnerTag.tag_option_id;
//     const partnerTagOptionName = Object.keys(Partner_tag_option_ids).find(
//       key => Partner_tag_option_ids[key] === partnerTagOptionId
//     );

//     if (!partnerTagOptionName) continue;

//     const { cluster, location } = await fetchPartnerDataFromCustomModule(partnerTagOptionName);

//     const clusterTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.CLUSTER);
//     const locationTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.LOCATION);

//     if (clusterTag && cluster) {
//       clusterTag.tag_option_id = Cluster_tag_option_ids[cluster] || "";
//     }
//     if (locationTag && location) {
//       locationTag.tag_option_id = Location_tag_option_ids[location] || "";
//     }
//   }
// }

// function validateReportingTags(lineItems) {
//   const errors = [];

//   for (const item of lineItems) {
//     const tags = item.tags || [];
//     const tagMap = Object.fromEntries(tags.map(tag => [tag.tag_id, tag.tag_option_id]));

//     const allTagsEmpty = Object.values(REPORTING_TAGS).every(
//       tagId => !tagMap[tagId]
//     );

//     if (allTagsEmpty) {
//       errors.push("All reporting tags are empty for one or more line items.");
//     }

//     const partnerFilled = !!tagMap[REPORTING_TAGS.PARTNER];
//     const departmentFilled = !!tagMap[REPORTING_TAGS.DEPARTMENT];

//     if (partnerFilled && departmentFilled) {
//       errors.push("Please select either Partner or Department, not both.");
//     }

//     const otherTagsFilled = [REPORTING_TAGS.CLUSTER, REPORTING_TAGS.LOCATION, REPORTING_TAGS.CENTRAL_OFF].some(
//       tagId => !!tagMap[tagId]
//     );

//     if ((!partnerFilled && !departmentFilled) && otherTagsFilled) {
//       errors.push("Partner or Department must be selected if other tags are filled.");
//     }
//   }

//   return errors;
// }

// ZFAPPS.extension.init().then(App => {
//   App.instance.on("ON_INVOICE_PRE_SAVE", async () => {
//     try {
//       const response = await ZFAPPS.get("invoice");
//       const invoice = response.invoice || response;

//       const lineItems = invoice.line_items || [];
//       const validationErrors = validateReportingTags(lineItems);

//       if (validationErrors.length > 0) {
//         return { prevent_save: true, message: validationErrors.join("\n") };
//       }

//       await autoPopulateClusterAndLocation(lineItems);
//       return { prevent_save: false };
//     } catch (error) {
//       console.error("Error during pre-save:", error);
//       return { prevent_save: true, message: "An error occurred during processing." };
//     }
//   });
// });

//   //------------------------------Version V1 Start-----------------------
//   //-----------------------------Version V2 Start---------------------------

// // Tag option IDs
// const Partner_tag_option_ids = { 
//     hariOm: "2144856000000042097",
//     Krunal: "2144856000000047307",
//   };
//   const Cluster_tag_option_ids = {
//     Strateworks: "2144856000000047213",
//   };
//   const Location_tag_option_ids = {
//     Surat: "2144856000000047241",
//     Navsari: "2144856000000047243",
//   };
  
//   // Custom module API names
//   const CustomModuleApiNames = {
//     PartnerDatas: "cm__in_rxupsfh_partnerdata_1",
//   };
  
//   // Custom module field API names
//   const CustomModuleFieldApiNames = {
//     Partner: "cf__in_rxupsfh_partner",
//     Cluster: "cf__in_rxupsfh_cluster",
//     location: "cf__in_rxupsfh_location",
//   };
  
//   // Reporting Tag IDs
//   const REPORTING_TAGS = {
//         PARTNER: "2144856000000000636",
//         CLUSTER: "2144856000000000634",
//         LOCATION: "2144856000000000642",
//         DEPARTMENT: "2144856000000000638",
//         CENTRALOFF: "2144856000000000640",
//       };
  
//   // Fetch custom module data for a Partner
// //   async function fetchPartnerDataFromCustomModule(partnerTagOptionName) {
// //     console.log("Flow enters into the fetchPartnerDataFromCustomModule()",partnerTagOptionName);
    
// //     try {
// // //       const response = await ZFAPPS.get("customrecord");
// // // console.log("Custom Modules:", response);
// // // const response = await ZFAPPS.getFromConnection("CustomModuleConnection", {
// // //   url: `https://books.zoho.com/api/v3/${moduleName}?${fieldName}=${partnerTagOptionName}`
// // // });
// // const response = await ZFAPPS.getFromConnection("CustomModuleConnection", {
// //   url: `https://books.zoho.in/api/v3/cm__in_rxupsfh_partnerdata_1`
// // });
// //       // const response = await ZFAPPS.get(`customrecord/cm__in_rxupsfh_partnerdata_1`, {
// //       //   query: { [CustomModuleFieldApiNames.Partner]: partnerTagOptionName },
// //       // });

// //       // const response = await ZFAPPS.get("cm__in_rxupsfh_partnerdata_1");

// //       // const response = await ZFAPPS.get(`customrecord/${CustomModuleApiNames.PartnerDatas}`, {
// //       //   query: { [CustomModuleFieldApiNames.Partner]: partnerTagOptionName },
// //       // });

// //       // const response = await ZFAPPS.get(`customrecord/${CustomModuleApiNames.PartnerDatas}`);

// //       // ZFAPPS.retrieve('cm__in_rxupsfh_partnerdata_1').then(function (data) {
// //       //   console.log("Custom Module data:",data);
        
// //         //response Handling
// //   //  }).catch(function (err) {
// //   //   console.log(err);
// //   //     //error Handling
// //   //  });

// //       console.log("response:",response);
      
  
// //       if (response && response.data && response.data.length > 0) {
// //         const partnerData = response.data[0];
// //         console.log("partnerData",partnerData);
        
// //         return {
// //           cluster: partnerData[CustomModuleFieldApiNames.Cluster] || "",
// //           location: partnerData[CustomModuleFieldApiNames.location] || "",
// //         };
// //       }
// //     } catch (error) {
// //       console.error("Error fetching data from custom module:", error);
// //     }
// //     return { cluster: "", location: "" };
// //   }
// async function fetchPartnerDataFromCustomModule(partnerTagOptionName) {
//   console.log("Fetching partner data for:", partnerTagOptionName);

//   try {
//     const options = {
//       url: 'https://www.zohoapis.in/books/v3/cm__in_rxupsfh_partnerdata_1?organization_id=60034848153',
//       method: "GET",
//       url_query: [
//         {
//           key: 'cf__in_rxupsfh_partner',
//           value: partnerTagOptionName, // Use the partner name dynamically
//         },
//       ],
//       connection_link_name: 'books',
//     };

//     // Invoke the API using ZFAPPS.request
//     const value = await ZFAPPS.request(options);
//     const responseJSON = JSON.parse(value.data.body);

//     console.log("API Response:", responseJSON);

//     // Ensure the response contains module records
//     if (responseJSON && responseJSON.module_records && responseJSON.module_records.length > 0) {
//       const partnerData = responseJSON.module_records[0]; // Since only one record is expected
//       console.log("Fetched partner data:", partnerData);

//       return {
//         cluster: partnerData.cf__in_rxupsfh_cluster || "",
//         location: partnerData.cf__in_rxupsfh_location || "",
//         partner: partnerData.cf__in_rxupsfh_partner || "",
//         recordId: partnerData.module_record_id || "",
//         status: partnerData.status || "unknown",
//       };
//     } else {
//       console.warn("No matching records found for partner:", partnerTagOptionName);
//       return null;
//     }
//   } catch (error) {
//     console.error("Error fetching data from custom module:", error);
//     return null;
//   }
// }


  
//   // // Auto-populate Cluster and Location
//   // async function autoPopulateClusterAndLocation(lineItems) {
//   //   console.log("flow enter in autoPopulateClusterAndLocation() ",lineItems);

//   //   for (const item of lineItems) {
//   //     const tags = item.tags || [];
  
//   //     // Fetch Partner tag
//   //     const partnerTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.PARTNER);
//   //     console.log("Found Partner_Tag:",partnerTag);
      
//   //     const partnerTagOptionId = partnerTag?.tag_option_id || "";
//   //     console.log("Found tag_option_id:",partnerTagOptionId);

  
//   //     if (!partnerTagOptionId) continue;
  
//   //     // Get the Partner name from tag_option_id
//   //     const partnerTagOptionName = Object.keys(Partner_tag_option_ids).find(
//   //       key => Partner_tag_option_ids[key] === partnerTagOptionId
//   //     );
//   //     console.log("partnerTagOptionName found:",partnerTagOptionName);
      
  
//   //     if (!partnerTagOptionName) continue;
  
//   //     // Fetch Cluster and Location data from the custom module
//   //     // const fetched_res = await fetchPartnerDataFromCustomModule(partnerTagOptionName);
//   //     // console.log("fetched_res",fetched_res);
      
//   //     const { cluster, location } = await fetchPartnerDataFromCustomModule(partnerTagOptionName);
//   //     console.log( `fetched function res:${ cluster, location }` );
      
//   //     console.log("Flow exits from the fetchPartnerDataFromCustomModule()");
      
  
//   //     // Update Cluster and Location tags
//   //     const clusterTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.CLUSTER);
//   //     console.log("clusterTag",clusterTag);
      
//   //     const locationTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.LOCATION);
//   //     console.log("locationTag",locationTag);
      
  
//   //     if (clusterTag && cluster) {
//   //       clusterTag.tag_option_id = Cluster_tag_option_ids[cluster] || "";
//   //     }
//   //     if (locationTag && location) {
//   //       locationTag.tag_option_id = Location_tag_option_ids[location] || "";
//   //     }
//   //   }
//   // }
  
//   // // Validation Logic
//   // function validateReportingTags(lineItems) {
//   //   const errors = [];
  
//   //   for (const item of lineItems) {
//   //     const tags = item.tags || [];
//   //     const tagMap = Object.fromEntries(tags.map(tag => [tag.tag_id, tag.tag_option_id]));
//   //     console.log("tagMap",tagMap);
      
  
//   //     // Check if all reporting tags are empty
//   //     const allTagsEmpty = Object.keys(REPORTING_TAGS).every(
//   //       key => !tagMap[REPORTING_TAGS[key]]
//   //     );
//   //     if (allTagsEmpty) {
//   //       alert("All Reporting tags are empty for one or more line items.");
//   //       errors.push("All Reporting tags are empty for one or more line items.");
//   //     }
  
//   //     // Check if both Partner and Department are filled
//   //     const xyz= REPORTING_TAGS.PARTNER;
//   //     console.log("xyz",xyz);

//   //     const abc= REPORTING_TAGS.DEPARTMENT;
//   //     console.log("abc",abc);
      
      
//   //     const partnerFilled = !!tagMap[REPORTING_TAGS.PARTNER];
//   //     const departmentFilled = !!tagMap[REPORTING_TAGS.DEPARTMENT];
//   //     console.log("partnerFilled",partnerFilled);
//   //     console.log("departmentFilled",departmentFilled);
      
  
//   //     if (partnerFilled && departmentFilled) {
//   //       alert("Please select either Partner or Department, not both.");
//   //       errors.push("Please select either Partner or Department, not both.");
//   //     }
//   //      // Ensure Partner or Department is selected if any other tag is filled
//   //     const otherTagsFilled = [REPORTING_TAGS.CLUSTER, REPORTING_TAGS.LOCATION, REPORTING_TAGS.CENTRAL_OFF].some(
//   //       tagId => !!tagMap[tagId]
//   //     );
//   //     console.log("otherTagsFilled",otherTagsFilled);
      
//   //     if ((!partnerFilled && !departmentFilled) && otherTagsFilled) {
//   //       alert("Partner or Department must be selected if other tags are filled.");
//   //       errors.push("Partner or Department must be selected if other tags are filled.");
//   //     }
//   //   }
  
//   //   return errors;
//   // }
//   async function autoPopulateClusterAndLocation(lineItems) {
//     console.log("Entering autoPopulateClusterAndLocation()", lineItems);
  
//     for (const item of lineItems) {
//       const tags = item.tags || [];
//       console.log("tags",tags);
      
  
//       // Fetch Partner tag
//       const partnerTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.PARTNER);
//       console.log("Found Partner Tag:", partnerTag);
  
//       if (!partnerTag) continue;
  
//       const partnerTagOptionId = partnerTag?.tag_option_id || "";
//       console.log("Found partnerTagOptionId:", partnerTagOptionId);
  
//       if (!partnerTagOptionId) continue;
  
//       // Get the Partner name from tag_option_id
//       const partnerTagOptionName = Object.keys(Partner_tag_option_ids).find(
//         key => Partner_tag_option_ids[key] === partnerTagOptionId
//       );
//       console.log("Found Partner Tag Option Name:", partnerTagOptionName);
  
//       if (!partnerTagOptionName) continue;
  
//       // Fetch Cluster and Location data from the custom module
//       const fetchedData = await fetchPartnerDataFromCustomModule(partnerTagOptionName);
//       console.log("Fetched Data:", fetchedData);
  
//       if (!fetchedData) {
//         console.warn(`No data fetched for Partner: ${partnerTagOptionName}`);
//         continue;
//       }
  
//       const { cluster, location } = fetchedData;
//       console.log(`Cluster: ${cluster}, Location: ${location}`);
  
//       // Update Cluster and Location tags
// let clusterTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.CLUSTER);
// console.log("clusterTag before:", clusterTag);

// let locationTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.LOCATION);
// console.log("locationTag before:", locationTag);

// // If cluster is found in the response, assign or create the clusterTag
// if (cluster) {
//   if (!clusterTag) {
//     // If clusterTag does not exist, create a new tag object
//     clusterTag = { tag_id: REPORTING_TAGS.CLUSTER, tag_option_id: "" };
//     tags.push(clusterTag); // Add the new tag to the tags array
//     console.log("Created new clusterTag:", clusterTag);
//   }

//   // Update tag_option_id using the pre-declared mapping
//   clusterTag.tag_option_id = Cluster_tag_option_ids[cluster] || "";
//   console.log("Updated clusterTag.tag_option_id:", clusterTag.tag_option_id);
// }

// // If location is found in the response, assign or create the locationTag
// if (location) {
//   if (!locationTag) {
//     // If locationTag does not exist, create a new tag object
//     locationTag = { tag_id: REPORTING_TAGS.LOCATION, tag_option_id: "" };
//     tags.push(locationTag); // Add the new tag to the tags array
//     console.log("Created new locationTag:", locationTag);
//   }

//   // Update tag_option_id using the pre-declared mapping
//   locationTag.tag_option_id = Location_tag_option_ids[location] || "";
//   console.log("Updated locationTag.tag_option_id:", locationTag.tag_option_id);
// }

//     }
//   }

//   function validateReportingTags(lineItems) {
//     console.log("Validating Reporting Tags for line items...");
//     const errors = [];
  
//     for (const item of lineItems) {
//       const tags = item.tags || [];
//       const tagMap = Object.fromEntries(tags.map(tag => [tag.tag_id, tag.tag_option_id]));
//       console.log("Tag Map:", tagMap);
  
//       // Check if all reporting tags are empty
//       const allTagsEmpty = Object.keys(REPORTING_TAGS).every(
//         key => !tagMap[REPORTING_TAGS[key]]
//       );
//       if (allTagsEmpty) {
//         const error = "All Reporting tags are empty for one or more line items.";
//         console.error(error);
//         errors.push(error);
//       }
  
//       // Check if both Partner and Department are filled
//       const partnerFilled = !!tagMap[REPORTING_TAGS.PARTNER];
//       const departmentFilled = !!tagMap[REPORTING_TAGS.DEPARTMENT];
//       console.log("Partner Filled:", partnerFilled, "Department Filled:", departmentFilled);
  
//       if (partnerFilled && departmentFilled) {
//         const error = "Please select either Partner or Department, not both.";
//         console.error(error);
//         errors.push(error);
//       }
  
//       // Ensure Partner or Department is selected if any other tag is filled
//       const otherTagsFilled = [
//         REPORTING_TAGS.CLUSTER,
//         REPORTING_TAGS.LOCATION,
//         REPORTING_TAGS.CENTRAL_OFF,
//       ].some(tagId => !!tagMap[tagId]);
//       console.log("Other Tags Filled:", otherTagsFilled);
  
//       if ((!partnerFilled && !departmentFilled) && otherTagsFilled) {
//         const error = "Partner or Department must be selected if other tags are filled.";
//         console.error(error);
//         errors.push(error);
//       }
//     }
  
//     return errors;
//   }
  
  
//   // Integrate the logic with Zoho Books pre-save hook
//   ZFAPPS.extension.init().then(App => {
//     App.instance.on("ON_INVOICE_PRE_SAVE", async () => {
//       return new Promise(async (resolve) => {
//         try {
//           // Fetch the invoice data
//           const response = await ZFAPPS.get("invoice");
//           const invoice = response?.invoice || response;
//           console.log("Fetched Invoice: ",invoice);
          
//           const lineItems = invoice.line_items || []; 
          
  
//           // Validation
//           const validationErrors = validateReportingTags(lineItems);
//           if (validationErrors.length > 0) {
//             resolve({ prevent_save: true, message: validationErrors.join("\n") });
//             return;
//           }
  
//           // Auto-populate Cluster and Location
//           await autoPopulateClusterAndLocation(lineItems);

//           await ZFAPPS.set("invoice.line_items.",getUpdatedInvoice);


//           // const setUpdatedInvoiceresponse = await ZFAPPS.set("invoice",getUpdatedInvoice);
//           // console.log("Fetched updatedInvoiceresponse: ",setUpdatedInvoiceresponse);
  
//           resolve({ prevent_save: false }); // Allow save
//         } catch (error) {
//           console.error("Error during pre-save processing:", error);
//           resolve({ prevent_save: true, message: "An error occurred while validating the invoice data." });
//         }
//       });
//     });
//   });

//   //-----------------------------Version V2 End---------------------------

  //------------------------------Version V1 ENd-----------------------
  
// // Define reporting tag IDs
// const REPORTING_TAGS = {
//     PARTNER: "2144856000000000636",
//     CLUSTER: "2144856000000000634",
//     LOCATION: "2144856000000000642",
//     DEPARTMENT: "2144856000000000638",
//     CENTRALOFF: "2144856000000000640",
//   };
  
//     // Function to validate line items
//   function validateLineItems(lineItems) {
//     for (const item of lineItems) {
//       const tags = item.tags || [];
  
//       // Extract tag_option_id values for each reporting tag
//       const partnerTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.PARTNER)?.tag_option_id || "";
//       console.log("=======partnerTag====",partnerTag);
      
//       const clusterTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.CLUSTER)?.tag_option_id || "";
//       console.log("=======clusterTag====",clusterTag);

//       const locationTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.LOCATION)?.tag_option_id || "";
//       console.log("=======locationTag====",locationTag);

//       const departmentTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.DEPARTMENT)?.tag_option_id || "";
//       console.log("=======departmentTag====",departmentTag);

//       const centralOffTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.CENTRALOFF)?.tag_option_id || "";
//       console.log("=======centralOffTag====",centralOffTag);

  
//       // Check if all reporting tags are empty
//       if (!partnerTag && !clusterTag && !locationTag && !departmentTag && !centralOffTag) {
//         alert("All reporting tags are empty for one or more line items.");
//         return false; // Prevent save
//       }
  
//       // Check if both Partner and Department tags are filled
//       if (partnerTag && departmentTag) {
//         alert("Please select either Partner or Department, not both.");
//         return false; // Prevent save
//       }
//     }
  
//     return true; // Allow save if validations pass
//   }
//   // Fetch cluster and location data from PartnerData custom module
//   async function fetchPartnerData(partnerTagOptionId) {
//     try {
//         console.log("fetchPartnerData() function start Executing and partnerTagOptionId",partnerTagOptionId);
        
//     //   const response = await ZFAPPS.get("customrecord/PartnerData", { query: { Partner: partnerTagOptionId } });
//       const response = await ZFAPPS.get("customrecord/cm__in_rxupsfh_partnerdata_1", { query: { cf__in_rxupsfh_partner: partnerTagOptionId } });

//     //   const response = await ZFAPPS.get("cm__in_rxupsfh_partnerdata_1/cf__in_rxupsfh_partner", { query: { cf__in_rxupsfh_partner: partnerTagOptionId } });

//       console.log("customrecord/PartnerData",response);
//       if (response && response.data && response.data.length > 0) {
//         const partnerData = response.data[0];
//         return {
//           cluster: partnerData.Cluster || "",
//           location: partnerData.Location || "",
//         };
//       }
//     } catch (error) {
//       console.error("Error fetching PartnerData:", error);
//     }
//     return { cluster: "", location: "" };
//   }
  
//   // Auto-populate Cluster and Location based on Partner
//   async function autoPopulateClusterAndLocation(lineItems) {
//     console.log("autoPopulateClusterAndLocation() Function Start Exection and lineItemslike:",lineItems);
    
//     for (const item of lineItems) {
//       const tags = item.tags || [];
  
//       // Fetch Partner Tag Option ID
//       const partnerTagOptionId = tags.find(tag => tag.tag_id === REPORTING_TAGS.PARTNER)?.tag_option_id || "";
  
//       // Skip if no Partner is selected
//       if (!partnerTagOptionId) continue;
  
//       // Fetch corresponding Cluster and Location
//       const { cluster, location } = await fetchPartnerData(partnerTagOptionId);
  
//       // Update tags with Cluster and Location
//       const clusterTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.CLUSTER);
//       const locationTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.LOCATION);
  
//       if (clusterTag) clusterTag.tag_option_id = cluster;
//       if (locationTag) locationTag.tag_option_id = location;
//     }
//   }
  
//   // Integrate into Zoho Books widget hook
//   ZFAPPS.extension.init().then(App => {
//     App.instance.on("ON_INVOICE_PRE_SAVE", async () => {
//       return new Promise(async (resolve) => {
//         try {
//           const response = await ZFAPPS.get("invoice");
//           const invoice = response?.invoice || response;
//           const lineItems = invoice.line_items || [];
  
//           // Auto-populate Cluster and Location
//           await autoPopulateClusterAndLocation(lineItems);
  
//           // Validation Logic (reuse from earlier code)
//           if (!validateLineItems(lineItems)) {
//             resolve({
//               prevent_save: true,
//               message: "Validation failed for reporting tags."
//             });
//           } else {
//             resolve({
//               prevent_save: false
//             });
//           }
//         } catch (error) {
//           console.error("Error fetching invoice data:", error);
//           resolve({
//             prevent_save: true,
//             message: "An error occurred during validation."
//           });
//         }
//       });
//     });
//   });
  


// // Define reporting tag IDs
// const REPORTING_TAGS = {
//     PARTNER: "2144856000000000636",
//     CLUSTER: "2144856000000000634",
//     LOCATION: "2144856000000000642",
//     DEPARTMENT: "2144856000000000638",
//     CENTRALOFF: "2144856000000000640",
//   };
  
//   // Function to validate line items
//   function validateLineItems(lineItems) {
//     for (const item of lineItems) {
//       const tags = item.tags || [];
  
//       // Extract tag_option_id values for each reporting tag
//       const partnerTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.PARTNER)?.tag_option_id || "";
//       console.log("=====partnerTag=======",partnerTag);
      
//       const clusterTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.CLUSTER)?.tag_option_id || "";
//       console.log("=====clusterTag=======",clusterTag);

//       const locationTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.LOCATION)?.tag_option_id || "";
//       console.log("=====locationTag=======",locationTag);

//       const departmentTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.DEPARTMENT)?.tag_option_id || "";
//       console.log("=====departmentTag=======",departmentTag);

//       const centralOffTag = tags.find(tag => tag.tag_id === REPORTING_TAGS.CENTRALOFF)?.tag_option_id || "";
//       console.log("=====centralOffTag=======",centralOffTag);
  
//       // Check if all reporting tags are empty
//       if (!partnerTag && !clusterTag && !locationTag && !departmentTag && !centralOffTag) {
//         alert("All reporting tags are empty for one or more line items.");
//         return false; // Prevent save
//       }
  
//       // Check if both Partner and Department tags are filled
//       if (partnerTag && departmentTag) {
//         alert("Please select either Partner or Department, not both.");
//         return false; // Prevent save
//       }
//     }
  
//     return true; // Allow save if validations pass
//   }
  
//   // Usage in Zoho Books widget hook
//   ZFAPPS.extension.init().then(App => {
//     App.instance.on("ON_INVOICE_PRE_SAVE", async () => {
//       return new Promise(async (resolve) => {
//         try {
//           const response = await ZFAPPS.get("invoice");

//           console.log("Fetched Response:",response );
          
//           const invoice = response?.invoice || response;
//           const lineItems = invoice.line_items || [];
  
//           if (!validateLineItems(lineItems)) {
//             resolve({
//               prevent_save: true,
//               message: "Validation failed for reporting tags."
//             });
//           } else {
//             resolve({
//               prevent_save: false
//             });
//           }
//         } catch (error) {
//           console.error("Error fetching invoice data:", error);
//           resolve({
//             prevent_save: true,
//             message: "An error occurred during validation."
//           });
//         }
//       });
//     });
//   });

  //----------------------Manually Collected API_Keys and IDs Start---------------


//   const Partner_tag_option_ids={
//     hariOm : "2144856000000042097",
//     Krunal : "2144856000000047307",
//   }
//   const Cluster_tag_option_ids={
//     Strateworks : "2144856000000047213",
//   }
//   const Location_tag_option_ids={
//     Surat:"2144856000000047241",
//     Navsari:"2144856000000047243"
//   }

//   const CustomModuleFieldApiNames ={
//     Partner:"cf__in_rxupsfh_partner",
//     Cluster:"cf__in_rxupsfh_cluster",
//     location:"cf__in_rxupsfh_location"
//   }

//   const CustomModuleApiNames={
//     PartnerDatas :"cm__in_rxupsfh_partnerdata_1"
//   }
  //----------------------Manually Collected API_Keys and IDs end---------------


//===========================old Working COde STart===========================================  

// ZFAPPS.extension.init().then((App) => {
//     console.log("Zoho Widget Initialized");
  
//     App.instance.on("ON_INVOICE_PRE_SAVE", async () => {
//       return new Promise(async (resolve, reject) => {
//         try {
//           const response = await ZFAPPS.get("invoice");
//           const invoice = response?.invoice || response;
  
//           console.log("Fetched Invoice:", invoice);
  
//           if (!invoice || !invoice.line_items) {
//             resolve({
//               prevent_save: true,
//               message: "Invoice data is incomplete. Cannot save."
//             });
//             return;
//           }
  
//           const allItemsHaveTags = invoice.line_items.every(
//             (item) => item.tags && item.tags.length > 0
//           );

//           invoice.line_items.forEach((item)=> {
//             item.tags;
//           });
  
//           if (!allItemsHaveTags) {
//             // Use Zoho Books modal API to show your custom modal
//             // ZFAPPS.showModal({
//             //   url: "/app/modal.html"
//             // });
//             alert("Please Fill the reporting Tag...")
//             resolve({
//               prevent_save: true,
//               message: "Tags are missing in one or more line items. Please add tags to proceed."
//             });
//           }
//           else if(allItemsHaveTags){

//           } else{

//             resolve({
//               prevent_save: false
//             });
//           }
//         } catch (error) {
//           console.error("Error fetching invoice data:", error);
//           resolve({
//             prevent_save: true,
//             message: "An error occurred while validating invoice data."
//           });
//         }
//       });
//     });
//   });
//===========================old Working COde End===========================================  

  
// console.log("It's your bundled js file"); 

// // Initialize Zoho Books widget
// ZFAPPS.extension.init().then((App) => {
//   console.log("Zoho Widget Initialized");

//   // Hook: Triggered before saving the invoice
//   App.instance.on("ON_INVOICE_PRE_SAVE", async () => {
//     return new Promise(async (resolve, reject) => {
//       try {
//         const response = await ZFAPPS.get("invoice");
//         const invoice = response?.invoice || response;

//         console.log("Fetched Invoice:", invoice);

//         if (!invoice || !invoice.line_items) {
//           resolve({
//             prevent_save: true,
//             message: "Invoice data is incomplete. Cannot save."
//           });
//           return;
//         }

//         const allItemsHaveTags = invoice.line_items.every(
//           (item) => item.tags && item.tags.length > 0
//         );

//         if (!allItemsHaveTags) {
//             // function showCustomAlert(message) {
//                 // document.getElementById("alertMessage").textContent = message;
//                 // const alertModal = document.getElementById("customAlert");
//                 // alertModal.classList.remove("hidden");
            
//                 // document.getElementById("closeAlert").onclick = () => {
//                 //   alertModal.classList.add("hidden");
//                 // };
//             //   }

//             function showCustomAlert(message) {
//                 // Set the message inside the modal
//                 const alertModal = document.getElementById("customAlert");
//                 const alertMessage = document.getElementById("alertMessage");
            
//                 if (alertModal && alertMessage) {
//                     alertMessage.textContent = message;
            
//                     // Remove the 'hidden' class to show the modal
//                     alertModal.classList.remove("hidden");
//                 } else {
//                     console.error("Modal elements not found in DOM.");
//                 }
//             }
            
//             ZFAPPS.showModal({
//                 // url: "/app/modal.html#/?route=modal"
//                 url: "/app/modal.html"
            

//             });

//             showCustomAlert("Tags are missing in one or more line items. Please add tags before saving. It's Custom Alert");
//           resolve({
//             prevent_save: true,
//             message: "Tags are missing in one or more line items. Please add tags to proceed."
//           });
//         } else {

//           resolve({
//             prevent_save: false
//           });
//         }
//       } catch (error) {
//         console.error("Error fetching invoice data:", error);
//         resolve({
//           prevent_save: true,
//           message: "An error occurred while validating invoice data."
//         });
//       }
//     });
//   });


// });


// // console.log("It's your bundled js file");

// // // Initialize Zoho Books widget


// // ZFAPPS.extension.init().then((App) => {
// //   console.log("Zoho Widget Initialized");


  

// //   // Hook: Triggered before saving the invoice
// //   App.instance.on("ON_INVOICE_PRE_SAVE", async () => {
// //     return new Promise(async (resolve, reject) => {
// //       try {
// //         // Fetch invoice data asynchronously
// //         const response = await ZFAPPS.get("invoice");
// //         const invoice = response?.invoice || response;

// //         console.log("Fetched Invoice:", invoice);

// //         // Validate if line items have tags
// //         if (!invoice || !invoice.line_items) {
// //             // Function to show custom alert
    
// //             // showCustomAlert("Tags are missing in one or more line items. Please add tags before saving.");
// //             // showCustomAlert("This is The Custom Alerts.");
// //         //   alert("Invoice line items are missing. Please add line items before saving.");
// //           resolve({
// //             prevent_save: true,
// //             message: "Invoice data is incomplete. Cannot save."
// //           });
// //           return;
// //         }

// //         // Check if all line items have tags
// //         const allItemsHaveTags = invoice.line_items.every(
// //           (item) => item.tags && item.tags.length > 0
// //         );

// //         if (!allItemsHaveTags) {

// //             function showCustomAlert(message) {
// //                 // Set the message inside the modal
// //                 document.getElementById("alertMessage").textContent = message;
            
// //                 // Show the modal by removing 'hidden' class
// //                 const alertModal = document.getElementById("customAlert");
// //                 alertModal.classList.remove("hidden");
            
// //                 // Add event listener to close button
// //                 document.getElementById("closeAlert").onclick = () => {
// //                     alertModal.classList.add("hidden");
// //                 };
// //                 }
// //           // Show alert and prevent save
// //         //   alert("Tags are missing in one or more line items. Please add tags before saving.");
// //           showCustomAlert("This is The Custom Alerts.");

// //           console.error("Reporting Tag is missing in line items.");

// //           resolve({
// //             prevent_save: true,
// //             message: "Tags are missing in one or more line items. Please add tags to proceed."
// //           });
// //         } else {
// //           // Allow saving if all line items have tags
// //           resolve({
// //             prevent_save: false
// //           });
// //         }
// //       } catch (error) {
// //         console.error("Error fetching invoice data:", error);
// //         resolve({
// //           prevent_save: true,
// //           message: "An error occurred while validating invoice data."
// //         });
// //       }
// //     });
// //   });
// // //   // Hook: Triggered before saving the invoice
// // //   App.instance.on("ON_SALES_ORDER_PRE_SAVE", async () => {
// // //     return new Promise(async (resolve, reject) => {
// // //       try {
// // //         // Fetch invoice data asynchronously
// // //         const response = await ZFAPPS.get("invoice");
// // //         const invoice = response?.invoice || response;

// // //         console.log("Fetched Invoice:", invoice);

// // //         // Validate if line items have tags
// // //         if (!invoice || !invoice.line_items) {
// // //           alert("Invoice line items are missing. Please add line items before saving.");
// // //           resolve({
// // //             prevent_save: true,
// // //             message: "Invoice data is incomplete. Cannot save."
// // //           });
// // //           return;
// // //         }

// // //         // Check if all line items have tags
// // //         const allItemsHaveTags = invoice.line_items.every(
// // //           (item) => item.tags && item.tags.length > 0
// // //         );

// // //         if (!allItemsHaveTags) {
// // //           // Show alert and prevent save
// // //           alert("Tags are missing in one or more line items. Please add tags before saving.");
// // //           console.error("Reporting Tag is missing in line items.");

// // //           resolve({
// // //             prevent_save: true,
// // //             message: "Tags are missing in one or more line items. Please add tags to proceed."
// // //           });
// // //         } else {
// // //           // Allow saving if all line items have tags
// // //           resolve({
// // //             prevent_save: false
// // //           });
// // //         }
// // //       } catch (error) {
// // //         console.error("Error fetching invoice data:", error);
// // //         resolve({
// // //           prevent_save: true,
// // //           message: "An error occurred while validating invoice data."
// // //         });
// // //       }
// // //     });
// // //   });
// // });
