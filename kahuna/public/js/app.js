// TODO: Grunt: hash dependencies? or ETag?
// TODO: Load templates using AMD so they can be compiled in

import angular from 'angular';
import 'npm:angular-ui-router';

var apiLink = document.querySelector('link[rel="media-api-uri"]');
var config = {
    mediaApiUri: apiLink.getAttribute('href')
};

var kahuna = angular.module('kahuna', [
    'ui.router'
]);


// Inject configuration values into the app
angular.forEach(config, function(value, key) {
    kahuna.constant(key, value);
});

kahuna.config(['$locationProvider',
               function($locationProvider) {

    // Use real URLs (with History API) instead of hashbangs
    $locationProvider.html5Mode(true).hashPrefix('!');
}]);

kahuna.config(['$stateProvider', '$urlRouterProvider',
               function($stateProvider, $urlRouterProvider) {

    var templatesDirectory = '/assets/templates';
    $stateProvider.state('search', {
        // Virtual state, we always want to be in a child state of this
        abstract: true,

        url: '/',
        templateUrl: templatesDirectory + '/search.html'
    });
    $stateProvider.state('search.results', {
        url: 'search?query&since',
        templateUrl: templatesDirectory + '/search/results.html',
        controller: 'SearchResultsCtrl'
    });

    $stateProvider.state('image', {
        url: '/images/:imageId',
        templateUrl: templatesDirectory + '/image.html',
        controller: 'ImageCtrl'
    });

    $urlRouterProvider.otherwise("/search");
}]);


kahuna.factory('mediaApi',
               ['$http', 'mediaApiUri',
                function($http, mediaApiUri) {

    function search(query, options) {
        options = options || {};

        return $http.get(mediaApiUri + '/images', {
            params: {
                q:      query || '',
                since:  options.since,
                until:  options.until,
                length: 20
            },
            withCredentials: true
        }).then(function(response) {
            return response.data.data;
        });
    }

    function find(id) {
        return $http.get(mediaApiUri + '/images/' + id, { withCredentials: true }).then(function(response) {
            return response.data;
        });
    }

    return {
        search: search,
        find: find
    };
}]);

kahuna.controller('SearchQueryCtrl',
                  ['$scope', '$state', '$stateParams',
                   function($scope, $state, $stateParams) {

    $scope.query = $stateParams.query || '';
    $scope.since = $stateParams.since || '';

    // Update state from search filters (skip initialisation step)
    $scope.$watch('query', function(query, oldQuery) {
        if (query !== oldQuery) {
            $state.go('search.results', {query: query});
        }
    });
    $scope.$watch('since', function(since, oldSince) {
        if (since !== oldSince) {
            $state.go('search.results', {since: since});
        }
    });

}]);


kahuna.controller('SearchResultsCtrl',
                  ['$scope', '$state', '$stateParams', '$timeout', 'mediaApi',
                   function($scope, $state, $stateParams, $timeout, mediaApi) {

    $scope.images = [];

    $scope.$watchCollection(function() {
        return {query: $stateParams.query, since: $stateParams.since};
    }, function(params) {
        mediaApi.search(params.query, {
            since: params.since
        }).then(function(images) {
            $scope.images = images;
            $timeout(function() {
                if ($scope.hasSpace) {
                    addImages();
                }
            });
        });
    });

    function addImages() {
        // TODO: stop once reached the end
        var lastImage = $scope.images.slice(-1)[0];
        if (lastImage) {
            var until = lastImage.data.uploadTime;
            mediaApi.search($stateParams.query, {
                until: until,
                since: $stateParams.since
            }).then(function(moreImages) {
                // Filter out duplicates (esp. on exact same 'until' date)
                var newImages = moreImages.filter(function(im) {
                    return $scope.images.filter(function(existing) {
                        return existing.uri === im.uri;
                    }).length === 0;
                });
                $scope.images = $scope.images.concat(newImages);
            });
        }
    }

    $scope.$watch('hitBottom', function(hitBottom) {
        if (hitBottom) {
            addImages();
        }
    });
}]);

kahuna.controller('ImageCtrl',
                  ['$scope', '$stateParams', 'mediaApi',
                   function($scope, $stateParams, mediaApi) {

    var imageId = $stateParams.imageId;

    mediaApi.find(imageId).then(function(image) {
        $scope.image = image;
    });

}]);

// Take an image and return a drag data map of mime-type -> value
kahuna.filter('asDragData', function() {
    return function(image) {
        var url = image && image.uri;
        if (url) {
            return {
                'text/plain':    url,
                'text/uri-list': url
            };
        }
    };
});

kahuna.directive('uiHasSpace', function() {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            scope.$watch(function() {
                scope[attrs.uiHasSpace] = element[0].scrollHeight <= element[0].clientHeight;
            });
        }
    }
});

kahuna.directive('uiHitBottom', function() {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            element.bind('scroll', function(e) {
                // TODO: debounce + defer
                var bottomPos = element[0].scrollTop + element[0].clientHeight;
                var viewHeight = element[0].scrollHeight;
                scope.$apply(function() {
                    scope[attrs.uiHitBottom] = bottomPos === viewHeight;
                });
            });
        }
    };
});

kahuna.directive('uiDragData', function() {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            element.bind('dragstart', function(e) {
                // No obvious way to receive an object through an
                // attribute without making this directive an
                // isolate scope...
                var dataMap = JSON.parse(attrs.uiDragData);
                Object.keys(dataMap).forEach(function(mimeType) {
                    e.dataTransfer.setData(mimeType, dataMap[mimeType]);
                });
            });
        }
    };
});

angular.bootstrap(document, ['kahuna']);