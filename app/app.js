(function () {
  new Vue({
    el: '#kabanaId',
    components: {
      TicketCard
    },
    data: {
      currentPage: 1,
      disablePagination: false,
      isDragging: false,
      onlyMyIssues: false,
      recentlyUpdated: false,
      fdObject: null,
      ticketFieldName: '',
      ticketFields: [],
      statusOptions: [],
      tickets: [],
      ticketBak: [],
      loading: {},
      loggedInUser: null,
      agentsList: [],
      groupsList: [],
      priorityList: [{
          "id": 1,
          "name": "Low",
          color: "#a0d76a"
        },
        {
          "id": 2,
          "name": "Medium",
          color: "#4da1ff"
        },
        {
          "id": 3,
          "name": "High",
          color: "#ffd012"
        },
        {
          "id": 4,
          "name": "Urgent",
          color: "#ff5959"
        },
      ],
      selectedAgents: [],
      selectedGroups: [],
      selectedPriority: null,
      defaultFilter: '',
      hasFilter: false,
      searchInput: '',
    },
    watch: {
      hasFilter() {
        if (!this.hasFilter) {
          this.onlyMyIssues = false;
          this.recentlyUpdated = false;
        }
      },

      searchInput() {
        if (this.searchInput.length > 0) {
          this.tickets = [];
          this.ticketBak.forEach(elm => {
            let tickt = elm.filter((elms) => {
              return elms.subject.toLowerCase().indexOf(this.searchInput.toLowerCase()) !== -1 ||elms.description_text.toLowerCase().indexOf(this.searchInput.toLowerCase()) !== -1 ||
              elms.id == this.searchInput
            });
            this.tickets.push(tickt);
          });
        } else {
          this.tickets = this.ticketBak;
        }
      }
    },

    created() {
      this.initFD();
    },

    methods: {
      initFD() {
        return app.initialized().then(client => {
          this.fdObject = client;
          this.fdObject.data.get("loggedInUser").then(data => {
            this.$refs.kanbanContainder.classList.remove('hide')
            this.loggedInUser = data.loggedInUser.id;
            this.getAgentList();
            this.getDataFromModel();
          }).catch(error => {
            console.log(error);
            this.showNotify({ message: error.response }, 'danger');
          });;
        }).catch(error => {
          console.log(error);
          this.showNotify({ message: error.response }, 'danger');
        });
      },

      showLoading(containerId) {
        if (this.loading[containerId] == null || !this.loading[containerId].visible) {
          this.loading[containerId] = this.$loading({
            lock: false,
            fullscreen: false,
            background: '#c0c0c021',
            target: document.querySelector(`[data-key="${containerId}"]`),
            text: 'Loading',
          });
        }
      },

      closeLoading(containerId) {
        if (this.loading[containerId] !== null) {
          this.loading[containerId].close();
        }
      },

      openSettings() {
        this.fdObject.interface.trigger("showModal", {
          title: "Configurations",
          template: "settings.html",
          data: {
            loggedInUser: this.loggedInUser,
          }
        });
      },

      getSelectedTicketFields() {
        return this.fdObject.db.get("ticket-fields-" + this.loggedInUser);
      },

      // TODO: we need to store the filters and get the filters and show it here.
      getTicketFieldsOptions() {
        this.getSelectedTicketFields().then((data) => {
          this.ticketFieldName = data.selectedTicketField;

          // this wil throw to catch block if source/product seleted already in previous versions (for backward compatabality)
          if (this.ticketFieldName === 'source' || this.ticketFieldName === 'product_id') {
            throw { status: 404 };
          }

          let selectedChoice = data.selectedChoice.map(elm => {
            elm.showInBoard = true;
            return elm;
          });

          let dataHidden = data.hiddenChoice || [];
          let hiddenChoice = dataHidden.map(elm => {
            elm.showInBoard = false;
            return elm;
          });

          this.ticketFields = [...selectedChoice, ...hiddenChoice];

          if (this.hasFilter) {
            this.handleOnlyMyTickets();
          } else {
            this.showAllLoading();
            this.getAllTickets();
          }

          }).catch(err => {
          if (err.status === 404) {
            const url = '<%= iparam.$domain.url %>/api/v2/ticket_fields?type=default_status';
            const headers = {
              "Authorization": "Basic <%= encode(iparam.api_key) %>"
            };
            const options = {
              headers: headers
            };

            this.fdObject.request.get(url, options)
              .then(data => {
                if (data.status == 200) {
                  let choice = JSON.parse(data.response)[0].choices;
                  let keyValue = [];
                  for (let key in choice) {
                    keyValue.push({
                      key: choice[key][0],
                      value: key.toString(),
                      showInBoard: true,
                    });
                  }
                  this.ticketFieldName = 'status';
                  this.ticketFields = keyValue;
                  if (this.hasFilter) {
                    this.handleOnlyMyTickets();
                  } else {
                    this.showAllLoading();
                    this.getAllTickets();
                  }
                } else {
                  throw data;
                }
              }).catch(error => {
                console.log(error);
                if (error.status == 400 || error.status == 404) {
                  this.showNotify({ message: 'Invalid API Key / Domain Name' }, 'danger');
                } else {
                  this.showNotify({ message: error.response }, 'danger');
                }
              });
          }
          // else {
          //     console.log(err);
          //     if (err.status == 400 || err.status == 404) {
          //       this.showNotify({ message: 'Invalid API Key / Domain Name' }, 'danger');
          //     } else {
          //       this.showNotify({ message: err.response }, 'danger');
          //     }
          //   }
        });
      },

      showAllLoading() {
        for (element of this.ticketFields) {
          if (element.showInBoard) {
            this.showLoading(element.key);
          }
        }
      },

      async getAllTickets() {
        this.searchInput = '';
        this.tickets = [];
        const pageOptions = `&page=${this.currentPage}`;
        const renamedField = this.ticketFieldName === 'responder_id' ? 'agent_id' : this.ticketFieldName;
        for (element of this.ticketFields) {
          if (element.showInBoard) {
            const defaultFilter = this.defaultFilter !== '' ? ` AND ${this.defaultFilter}` : '';
            // Filter for custom field ad type will be string, so checking and adding the same
            const isString = this.ticketFieldName.startsWith('cf_') || this.ticketFieldName === 'type';
            const filter = encodeURI(`query="${renamedField}:${element.value !== 'Unassigned' ? (isString ? `'${element.value}'` : element.value) : null}${defaultFilter}"`);
            const url = '<%= iparam.$domain.url %>/api/v2/search/tickets?' + filter + pageOptions;
            const headers = {
              "Authorization": "Basic <%= encode(iparam.api_key) %>"
            };
            const options = {
              headers: headers
            };

            await this.fdObject.request.get(url, options)
              .then(data => {
                if (data.status == 200) {
                  const tickets = JSON.parse(data.response);
                  this.tickets.push(this.getTickets(tickets.results, element.value));
                  this.closeLoading(element.key);
                  this.ticketBak = this.tickets;
                }
                else {
                  this.closeLoading(element.key);
                  throw data;
                }
              }).catch(error => {
                this.closeLoading(element.key);
                console.log(error);
                if (error.status == 400 || error.status == 404) {
                  this.showNotify({ message: 'Invalid API Key / Domain Name' }, 'danger');
                } else {
                  this.showNotify({ message: error.response }, 'danger');
                }
              });
          }

          this.disablePagination = false;
        }
      },

      formatDate(date) {
        let day = date.getDate();
        let monthIndex = date.getMonth() + 1;
        const year = date.getFullYear();
        if (monthIndex <= 9) {
          monthIndex = '0' + monthIndex;
        }
        if (day <= 9) {
          day = '0' + day;
        }
        return year + '-' + monthIndex + '-' + day;
      },

      getTickets(tickets, value) {
        const ticketData = tickets.filter((element) => {
          let ticket = this.ticketFieldName.startsWith('cf_') ? element.custom_fields : element;
          if (value == 'Unassigned') {
            return ticket[this.ticketFieldName] == null;
          } else {
            return ticket[this.ticketFieldName] == value;
          }
        });
        return ticketData;
      },

      handleTicketClicked(ticketId, subject, agentName, status) {
        this.fdObject.interface.trigger("showModal", {
          title: `#${ticketId} - ` + subject,
          template: "modal.html",
          data: {
            ticketId: ticketId,
            agentName: agentName,
            status: this.statusOptions[status][0],
            agentsList: this.agentsList
          }
        });
      },

      getDataFromModel() {
        this.fdObject.instance.receive(event => {
          const data = event.helper.getData();
          if (data.message.fromModel) {
            this.fdObject.interface.trigger("click", {
              id: "ticket",
              value: data.message.redirect
            });
          } else {
            // Workaround to select only my issues default if it is already selected
            this.onlyMyIssues = false;

            this.getTicketFieldsOptions();
          }
        });
      },

      getAgentList(currentPage = 1) {
        const url = `<%= iparam.$domain.url %>/api/v2/agents?per_page=100&page=${currentPage}`;
        const headers = {
          "Authorization": "Basic <%= encode(iparam.api_key) %>"
        };
        const options = {
          headers: headers
        };
        this.fdObject.request.get(url, options)
          .then(data => {
            if (data.status == 200) {
              let resp = JSON.parse(data.response);
              this.agentsList = [...this.agentsList, ...resp];
              // get all the agents since it will return 100 by default.
              // data.header.link will give the next page if it has more than that,
              // otherwise it is empty
              if (data.headers.link && resp.length) {
                return this.getAgentList(++currentPage);
              }
              // Get all the data after retriving all the agents list.
              this.getStatusList();
              this.hasFilter = false;
              this.getTicketFieldsOptions();
              this.getGroupList();
            } else {
              throw data;
            }
          }).catch(error => {
            console.log(error);
            if (error.status == 400 || error.status == 404) {
              this.showNotify({ message: 'Invalid API Key / Domain Name' }, 'danger');
            } else {
              this.showNotify({ message: error.response }, 'danger');
            }
          });
      },

      getAgentNameFromList(agentId) {
        let agentName = this.agentsList.filter(elm => elm.id == agentId);
        try {
          return agentName[0].contact.name;
        } catch (e) {
          return ' ';
        }
      },

      getGroupList() {
        const url = '<%= iparam.$domain.url %>/api/v2/ticket_fields?type=default_group';
        const headers = {
          "Authorization": "Basic <%= encode(iparam.api_key) %>"
        };
        const options = {
          headers: headers
        };
        this.fdObject.request.get(url, options)
          .then(data => {
            if (data.status == 200) {
              const keyValue = [];
              const response = JSON.parse(data.response)[0];
              for (let key in response.choices) {
                keyValue.push({
                  id: response.choices[key],
                  name: key
                });
              }
              this.groupsList = keyValue;
            } else {
              throw data;
            }
          }).catch(error => {
            console.log(error);
            if (error.status == 400 || error.status == 404) {
              this.showNotify({ message: 'Invalid API Key / Domain Name' }, 'danger');
            } else {
              this.showNotify({ message: error.response }, 'danger');
            }
          });
      },

      getStatusList() {
         const url = '<%= iparam.$domain.url %>/api/v2/ticket_fields?type=default_status';
         const headers = {
           "Authorization": "Basic <%= encode(iparam.api_key) %>"
         };
         const options = {
           headers: headers
         };

        this.fdObject.request.get(url, options)
          .then(data => {
            if (data.status == 200) {
              this.statusOptions = JSON.parse(data.response)[0].choices;
            }
          }).catch(error => {
            console.log(error);
            if (error.status == 400 || error.status == 404) {
              this.showNotify({ message: 'Invalid API Key / Domain Name' }, 'danger');
            } else {
              this.showNotify({ message: error.response }, 'danger');
            }
          });;
      },

      handleTicketDragEnd(evt) {
        const id = evt.item._underlying_vm_.id;
        const status = (this.ticketFieldName.startsWith('cf_') || this.ticketFieldName == 'type') ? evt.target.id : parseInt(evt.target.id);
        this.changeTicketFieldStatus(id, status);
      },

      showNotify(message, type) {
        this.fdObject.interface.trigger("showNotify", {
          type: type,
          title: message.status || '',
          message: message.message
        });
      },

      changeTicketFieldStatus(id, status) {
        const url = '<%= iparam.$domain.url %>/api/channel/v2/tickets/' + id;
        const headers = {
          "Authorization": "Basic <%= encode(iparam.api_key) %>",
          "content-type": "application/json"
        };
        let body = {};
        if (this.ticketFieldName.startsWith('cf_')) {
          body["custom_fields"] = {};
          body['custom_fields'][this.ticketFieldName] = status;
        } else {
          body[this.ticketFieldName] = status;
        }
        const options = {
          headers: headers,
          body: JSON.stringify(body),
        };
        this.fdObject.request.put(url, options)
          .then(data => {
            if (data.status == 200) {
              this.showNotify({
                message: "Status updated"
              }, 'success');
            } else {
              throw data;
            }
          }).catch(error => {
            console.log(error);
            this.showNotify({ message: error.response }, 'danger');
          });
      },

      _handlepreviousPage() {
        if (this.currentPage > 1) {
          this.currentPage--;
        }
        this.disablePagination = true;
        this.showAllLoading();
        this.getAllTickets();
      },

      _handleNextPage() {
        if (this.currentPage >= 1) {
          this.currentPage++;
        }
        this.disablePagination = true;
        this.showAllLoading();
        this.getAllTickets();
      },

      _handleRefresh() {
        this.currentPage = 1;
        this.showAllLoading();
        this.getAllTickets();
      },

      _handleRemoveFilters() {
        this.selectedAgents = [];
        this.selectedGroups = [];
        this.selectedPriority = null;
        this.buildFilters();
      },

      _getState(key) {
        return `Drag and Drop here to ${key} state`
      },

      handleOnlyMyTickets() {
        this.onlyMyIssues = true;
        this.buildFilters();
      },

      handleAllTickets() {
        this.onlyMyIssues = false;
        this.buildFilters();
      },

      handleRecentlyUpdated() {
        this.recentlyUpdated = !this.recentlyUpdated;
        this.buildFilters();
      },

      _filterSelectedAgents() {
        this.buildFilters();
      },

      _filterSelectedGroups() {
        this.buildFilters();
      },

      _filterSelectedPriority() {
        this.buildFilters();
      },

      buildFilters() {
        let queryParams = [];
        let agentParams = [];
        let groupParams = [];
        if (this.onlyMyIssues) {
          agentParams.push(`agent_id:${this.loggedInUser}`);
        }

        this.selectedAgents.forEach(element => {
          agentParams.push(`agent_id:${element}`);
        });

        this.selectedGroups.forEach(element => {
          groupParams.push(`group_id:${element}`);
        });

        if (agentParams.length > 0 && groupParams.length > 0) {
          queryParams.push(`(${agentParams.join(' OR ')}) OR (${groupParams.join(' OR ')})`);
        } else {
          if (agentParams.length > 0) {
            queryParams.push(`(${agentParams.join(' OR ')})`);
          }

          if (groupParams.length > 0) {
            queryParams.push(`(${groupParams.join(' OR ')})`);
          }
        }
        if (this.selectedPriority !== undefined && this.selectedPriority !== null) {
          queryParams.push(`priority:${this.selectedPriority}`);
        }

        if (this.recentlyUpdated) {
          let date = new Date();
          queryParams.push(`updated_at:'${this.formatDate(date)}'`);
        }
        this.showAllLoading();
        if (queryParams.length > 0) {
          this.hasFilter = true;
          this.currentPage = 1;
          this.defaultFilter = queryParams.join(' AND ');
          this.getAllTickets();
        } else {
          this.hasFilter = false;
          this.currentPage = 1;
          this.defaultFilter = ''
          this.getAllTickets();
        }
      }
    }
  })
})();
